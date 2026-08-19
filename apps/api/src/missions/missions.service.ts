import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportStatuses, reports } from '../db/schema/reports-schema';
import { missionMessages, missionVolunteerStatuses, missionVolunteers, missions } from '../db/schema/missions-schema';

type VolunteerStatusKey = 'joined' | 'active' | 'released';

type RosterVolunteer = {
  id: string;
  volunteerId: string;
  name: string;
  avatarUrl: string | null;
  status: VolunteerStatusKey;
  confirmDeadline: string | null;
  joinedAt: string;
};

type RosterResponse = {
  neededVolunteers: number;
  volunteers: RosterVolunteer[];
  myStatus: VolunteerStatusKey | null;
  myConfirmDeadline: string | null;
};

const CONFIRM_WINDOW_MS = 15 * 60_000;

@Injectable()
export class MissionsService {
  private async getVolunteerStatusIdByKey(key: VolunteerStatusKey): Promise<string> {
    const [status] = await db
      .select()
      .from(missionVolunteerStatuses)
      .where(eq(missionVolunteerStatuses.key, key));
    if (!status) throw new Error(`mission_volunteer_statuses row missing for key "${key}" — did db:seed run?`);
    return status.id;
  }

  private async getOrCreateMission(reportId: string): Promise<string> {
    const [existing] = await db.select().from(missions).where(eq(missions.reportId, reportId));
    if (existing) return existing.id;

    const id = uuidv7();
    await db.insert(missions).values({ id, reportId });
    return id;
  }

  private async findMissionId(reportId: string): Promise<string | null> {
    const [mission] = await db.select().from(missions).where(eq(missions.reportId, reportId));
    return mission?.id ?? null;
  }

  private async requireMissionId(reportId: string): Promise<string> {
    const missionId = await this.findMissionId(reportId);
    if (!missionId) throw new NotFoundException('No mission exists yet for this report');
    return missionId;
  }

  // BR-3: the 15-minute deadline is checked here, lazily, every time a
  // mission's volunteers are read or acted on — never by a scheduled job.
  // Any 'joined' row past its deadline is rewritten to 'released' before
  // the caller sees it.
  private async expireStaleAndListVolunteers(missionId: string) {
    const rows = await db
      .select({ mv: missionVolunteers, status: missionVolunteerStatuses })
      .from(missionVolunteers)
      .innerJoin(missionVolunteerStatuses, eq(missionVolunteers.statusId, missionVolunteerStatuses.id))
      .where(eq(missionVolunteers.missionId, missionId));

    const now = new Date();
    const stale = rows.filter((r) => r.status.key === 'joined' && r.mv.confirmDeadline < now);
    if (stale.length === 0) return rows;

    const releasedStatusId = await this.getVolunteerStatusIdByKey('released');
    for (const row of stale) {
      await db
        .update(missionVolunteers)
        .set({ statusId: releasedStatusId, releasedAt: now, releaseReason: 'timeout' })
        .where(eq(missionVolunteers.id, row.mv.id));
    }

    return db
      .select({ mv: missionVolunteers, status: missionVolunteerStatuses })
      .from(missionVolunteers)
      .innerJoin(missionVolunteerStatuses, eq(missionVolunteers.statusId, missionVolunteerStatuses.id))
      .where(eq(missionVolunteers.missionId, missionId));
  }

  // BR-4: the reporter, or a volunteer currently 'joined'/'active' (not
  // 'released'). Used to gate both Mission Chat and the phone reveal.
  async hasActiveAccess(reportId: string, userId: string): Promise<boolean> {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) return false;
    if (report.reporterId === userId) return true;

    const missionId = await this.findMissionId(reportId);
    if (!missionId) return false;

    const rows = await this.expireStaleAndListVolunteers(missionId);
    return rows.some((r) => r.mv.volunteerId === userId && r.status.key !== 'released');
  }

  async accept(reportId: string, volunteerId: string): Promise<RosterResponse> {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');
    if (report.reporterId === volunteerId) {
      throw new BadRequestException('You cannot accept your own report');
    }

    const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.id, report.statusId));
    if (status?.key !== 'open') throw new BadRequestException('This request is no longer open');

    const missionId = await this.getOrCreateMission(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    const activeRows = rows.filter((r) => r.status.key !== 'released');

    if (activeRows.some((r) => r.mv.volunteerId === volunteerId)) {
      throw new BadRequestException('You already accepted this request');
    }
    if (activeRows.length >= report.neededVolunteers) {
      throw new BadRequestException('Volunteer limit reached for this request');
    }

    const joinedStatusId = await this.getVolunteerStatusIdByKey('joined');
    const now = new Date();
    await db.insert(missionVolunteers).values({
      id: uuidv7(),
      missionId,
      volunteerId,
      statusId: joinedStatusId,
      confirmDeadline: new Date(now.getTime() + CONFIRM_WINDOW_MS),
      joinedAt: now,
    });

    return this.getRoster(reportId, volunteerId);
  }

  async confirm(reportId: string, volunteerId: string): Promise<RosterResponse> {
    const missionId = await this.requireMissionId(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    const mine = rows.find((r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released');
    if (!mine) {
      throw new BadRequestException(
        'Your acceptance window has expired or you never accepted this request — try accepting again'
      );
    }
    if (mine.status.key === 'active') return this.getRoster(reportId, volunteerId);

    const activeStatusId = await this.getVolunteerStatusIdByKey('active');
    await db
      .update(missionVolunteers)
      .set({ statusId: activeStatusId, confirmedAt: new Date() })
      .where(eq(missionVolunteers.id, mine.mv.id));

    return this.getRoster(reportId, volunteerId);
  }

  async leave(reportId: string, volunteerId: string): Promise<RosterResponse> {
    const missionId = await this.requireMissionId(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    const mine = rows.find((r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released');
    if (!mine) throw new BadRequestException('You have no active acceptance on this request');

    const releasedStatusId = await this.getVolunteerStatusIdByKey('released');
    await db
      .update(missionVolunteers)
      .set({ statusId: releasedStatusId, releasedAt: new Date(), releaseReason: 'voluntary' })
      .where(eq(missionVolunteers.id, mine.mv.id));

    return this.getRoster(reportId, volunteerId);
  }

  async getRoster(reportId: string, requestingUserId: string): Promise<RosterResponse> {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');

    const missionId = await this.findMissionId(reportId);
    if (!missionId) {
      return { neededVolunteers: report.neededVolunteers, volunteers: [], myStatus: null, myConfirmDeadline: null };
    }

    const rows = await this.expireStaleAndListVolunteers(missionId);
    const volunteerIds = [...new Set(rows.map((r) => r.mv.volunteerId))];
    const volunteerUsers = volunteerIds.length
      ? await db.select().from(user).where(inArray(user.id, volunteerIds))
      : [];
    const userById = new Map(volunteerUsers.map((u) => [u.id, u]));
    const mine = rows.find((r) => r.mv.volunteerId === requestingUserId);

    return {
      neededVolunteers: report.neededVolunteers,
      volunteers: rows.map((r) => ({
        id: r.mv.id,
        volunteerId: r.mv.volunteerId,
        name: userById.get(r.mv.volunteerId)?.name ?? 'Volunteer',
        avatarUrl: userById.get(r.mv.volunteerId)?.avatarUrl ?? null,
        status: r.status.key as VolunteerStatusKey,
        confirmDeadline: r.status.key === 'joined' ? r.mv.confirmDeadline.toISOString() : null,
        joinedAt: r.mv.joinedAt.toISOString(),
      })),
      myStatus: mine ? (mine.status.key as VolunteerStatusKey) : null,
      myConfirmDeadline: mine && mine.status.key === 'joined' ? mine.mv.confirmDeadline.toISOString() : null,
    };
  }

  // BR-4: gated on hasActiveAccess, checked here — not just hidden client-side.
  async listMessages(reportId: string, requestingUserId: string) {
    if (!(await this.hasActiveAccess(reportId, requestingUserId))) {
      throw new ForbiddenException('You need to accept this request to view Mission Chat');
    }
    const missionId = await this.requireMissionId(reportId);

    const rows = await db
      .select({ msg: missionMessages, sender: user })
      .from(missionMessages)
      .innerJoin(user, eq(missionMessages.senderId, user.id))
      .where(eq(missionMessages.missionId, missionId))
      .orderBy(missionMessages.createdAt);

    return rows.map((r) => ({
      id: r.msg.id,
      senderId: r.msg.senderId,
      senderName: r.sender.name,
      body: r.msg.body,
      createdAt: r.msg.createdAt.toISOString(),
      isMine: r.msg.senderId === requestingUserId,
    }));
  }

  async sendMessage(reportId: string, senderId: string, body: string) {
    if (!(await this.hasActiveAccess(reportId, senderId))) {
      throw new ForbiddenException('You need to accept this request to post in Mission Chat');
    }
    const missionId = await this.requireMissionId(reportId);
    await db.insert(missionMessages).values({ id: uuidv7(), missionId, senderId, body });
    return this.listMessages(reportId, senderId);
  }
}
