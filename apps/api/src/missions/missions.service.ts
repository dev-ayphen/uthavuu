import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { desc, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  reportCategories,
  reportPhotos,
  reportStatuses,
  reports,
} from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionCompletionStatuses,
  missionMessages,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
  progressStatuses,
} from '../db/schema/missions-schema';
import { AlertsService } from '../alerts/alerts.service';
import { UPLOADS_DIR } from '../uploads/multer.config';

type VolunteerStatusKey = 'joined' | 'active' | 'released';
type ProgressStatusKey = 'on_the_way' | 'reached_location' | 'helping_now';

type MyMissionSummary = {
  reportId: string;
  title: string;
  category: { key: string; label: string; emoji: string };
  reportStatus: string;
  photo: string | null;
  landmark: string | null;
  lat: number;
  lng: number;
  // Same anonymity rule as ReportsService.toResponse(): null when the
  // report is anonymous, regardless of the requester's volunteer access.
  reporterName: string | null;
  // True when the report's reporter account was deleted (reports.reporterId
  // is SET NULL, not cascade) — distinct from the report being anonymous,
  // which is reporterName === null with reporterDeleted === false.
  reporterDeleted: boolean;
  myStatus: VolunteerStatusKey;
  myConfirmDeadline: string | null;
  joinedAt: string;
};

type ProgressStatusInfo = {
  key: ProgressStatusKey;
  label: string;
  onWayAt: string | null;
  reachedAt: string | null;
  helpingAt: string | null;
};

type RosterVolunteer = {
  id: string;
  // Null when this volunteer's account has been deleted (mission_volunteers
  // .volunteerId is SET NULL, not cascade) — the row itself (and their
  // participation history) survives.
  volunteerId: string | null;
  name: string;
  // True when volunteerId is null for that reason — see above. Kept as its
  // own flag (rather than making the caller infer it from volunteerId)
  // since the roster already draws a hard distinction between deleted and
  // anonymous elsewhere in this response shape.
  volunteerDeleted: boolean;
  avatarUrl: string | null;
  status: VolunteerStatusKey;
  confirmDeadline: string | null;
  joinedAt: string;
  // Only ever non-null for an 'active' volunteer — participation and
  // progress are deliberately separate concepts, see missions-schema.ts.
  progressStatus: ProgressStatusInfo | null;
};

type RosterResponse = {
  neededVolunteers: number;
  volunteers: RosterVolunteer[];
  myStatus: VolunteerStatusKey | null;
  myConfirmDeadline: string | null;
  myProgressStatus: ProgressStatusInfo | null;
  completion: { photoUrl: string; note: string; verifiedAt: string } | null;
};

const CONFIRM_WINDOW_MS = 15 * 60_000;

@Injectable()
export class MissionsService {
  constructor(private readonly alertsService: AlertsService) {}

  private async getVolunteerStatusIdByKey(
    key: VolunteerStatusKey,
  ): Promise<string> {
    const [status] = await db
      .select()
      .from(missionVolunteerStatuses)
      .where(eq(missionVolunteerStatuses.key, key));
    if (!status)
      throw new Error(
        `mission_volunteer_statuses row missing for key "${key}" — did db:seed run?`,
      );
    return status.id;
  }

  private async getProgressStatusIdByKey(
    key: ProgressStatusKey,
  ): Promise<string> {
    const [status] = await db
      .select()
      .from(progressStatuses)
      .where(eq(progressStatuses.key, key));
    if (!status)
      throw new Error(
        `progress_statuses row missing for key "${key}" — did db:seed run?`,
      );
    return status.id;
  }

  private async getReportStatusIdByKey(
    key: 'open' | 'closed' | 'expired' | 'completed',
  ): Promise<string> {
    const [status] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.key, key));
    if (!status)
      throw new Error(
        `report_statuses row missing for key "${key}" — did db:seed run?`,
      );
    return status.id;
  }

  private async getCompletionStatusIdByKey(
    key: 'submitted' | 'waiting_verification' | 'verified',
  ): Promise<string> {
    const [status] = await db
      .select()
      .from(missionCompletionStatuses)
      .where(eq(missionCompletionStatuses.key, key));
    if (!status)
      throw new Error(
        `mission_completion_statuses row missing for key "${key}" — did db:seed run?`,
      );
    return status.id;
  }

  // BR-3: real verification, not fabricated ML content analysis — confirms
  // the submitted photo actually came from this app's own upload store
  // (matches the URL shape POST /uploads returns, and the file genuinely
  // exists on disk) rather than trusting an arbitrary client-supplied URL.
  private isGenuineUpload(photoUrl: string): boolean {
    const prefix = `${process.env.BETTER_AUTH_URL}/uploads/`;
    if (!photoUrl.startsWith(prefix)) return false;
    const filename = photoUrl.slice(prefix.length);
    if (!filename || filename.includes('/') || filename.includes('..'))
      return false;
    return existsSync(join(UPLOADS_DIR, filename));
  }

  private async getOrCreateMission(reportId: string): Promise<string> {
    const [existing] = await db
      .select()
      .from(missions)
      .where(eq(missions.reportId, reportId));
    if (existing) return existing.id;

    const id = uuidv7();
    await db.insert(missions).values({ id, reportId });
    return id;
  }

  private async findMissionId(reportId: string): Promise<string | null> {
    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.reportId, reportId));
    return mission?.id ?? null;
  }

  private async requireMissionId(reportId: string): Promise<string> {
    const missionId = await this.findMissionId(reportId);
    if (!missionId)
      throw new NotFoundException('No mission exists yet for this report');
    return missionId;
  }

  // BR-3: the 15-minute deadline is checked here, lazily, every time a
  // mission's volunteers are read or acted on — never by a scheduled job.
  // Any 'joined' row past its deadline is rewritten to 'released' before
  // the caller sees it.
  private async expireStaleAndListVolunteers(missionId: string) {
    const rows = await db
      .select({ mv: missionVolunteers, status: missionVolunteerStatuses, progress: progressStatuses })
      .from(missionVolunteers)
      .innerJoin(
        missionVolunteerStatuses,
        eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
      )
      .leftJoin(progressStatuses, eq(missionVolunteers.progressStatusId, progressStatuses.id))
      .where(eq(missionVolunteers.missionId, missionId));

    const now = new Date();
    const stale = rows.filter(
      (r) => r.status.key === 'joined' && r.mv.confirmDeadline < now,
    );
    if (stale.length === 0) return rows;

    const releasedStatusId = await this.getVolunteerStatusIdByKey('released');
    for (const row of stale) {
      await db
        .update(missionVolunteers)
        .set({
          statusId: releasedStatusId,
          releasedAt: now,
          releaseReason: 'timeout',
        })
        .where(eq(missionVolunteers.id, row.mv.id));
    }

    return db
      .select({ mv: missionVolunteers, status: missionVolunteerStatuses, progress: progressStatuses })
      .from(missionVolunteers)
      .innerJoin(
        missionVolunteerStatuses,
        eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
      )
      .leftJoin(progressStatuses, eq(missionVolunteers.progressStatusId, progressStatuses.id))
      .where(eq(missionVolunteers.missionId, missionId));
  }

  // BR-4: the reporter, or a volunteer currently 'joined'/'active' (not
  // 'released'). Used to gate both Mission Chat and the phone reveal.
  async hasActiveAccess(reportId: string, userId: string): Promise<boolean> {
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    if (!report) return false;
    if (report.reporterId === userId) return true;

    const missionId = await this.findMissionId(reportId);
    if (!missionId) return false;

    const rows = await this.expireStaleAndListVolunteers(missionId);
    return rows.some(
      (r) => r.mv.volunteerId === userId && r.status.key !== 'released',
    );
  }

  // edit-cancel-report.md: Edit Report locks once ANY volunteer has
  // joined/is active — unlike hasActiveAccess above, this isn't scoped to
  // one requesting user, it's "has this report attracted a real response
  // yet at all." No mission row yet means trivially no.
  async hasAnyActiveVolunteer(reportId: string): Promise<boolean> {
    const missionId = await this.findMissionId(reportId);
    if (!missionId) return false;

    const rows = await this.expireStaleAndListVolunteers(missionId);
    return rows.some((r) => r.status.key !== 'released');
  }

  // Cancel Report: who to notify. Same active-volunteer definition as
  // hasAnyActiveVolunteer, returning ids instead of a boolean.
  async listActiveVolunteerIds(reportId: string): Promise<string[]> {
    const missionId = await this.findMissionId(reportId);
    if (!missionId) return [];

    const rows = await this.expireStaleAndListVolunteers(missionId);
    // A row only loses its volunteerId (SET NULL on account deletion) once
    // it's released — UsersService.deleteAccount() always releases the row
    // in the same transaction before the FK can null it out — so this
    // filter never actually needs to drop anything live; it's here so the
    // return type stays string[], not (string | null)[].
    return [
      ...new Set(
        rows.filter((r) => r.status.key !== 'released').map((r) => r.mv.volunteerId).filter((id): id is string => id !== null)
      ),
    ];
  }

  // My Impact Stories (reporter angle — ImpactStoriesService.list()): the
  // outcome/after-photo for reports this user reported themselves, keyed by
  // reportId. A report with no completed mission simply has no entry here.
  async getCompletionPhotosByReportIds(reportIds: string[]): Promise<Map<string, string>> {
    if (reportIds.length === 0) return new Map();

    const rows = await db
      .select({ reportId: missions.reportId, photoUrl: missionCompletions.photoUrl })
      .from(missionCompletions)
      .innerJoin(missions, eq(missionCompletions.missionId, missions.id))
      .where(inArray(missions.reportId, reportIds));

    return new Map(rows.map((r) => [r.reportId, r.photoUrl]));
  }

  async accept(reportId: string, volunteerId: string): Promise<RosterResponse> {
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');
    if (report.reporterId === volunteerId) {
      throw new BadRequestException('You cannot accept your own report');
    }

    const [status] = await db
      .select()
      .from(reportStatuses)
      .where(eq(reportStatuses.id, report.statusId));
    if (status?.key !== 'open')
      throw new BadRequestException('This request is no longer open');

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

    const [volunteer] = await db
      .select()
      .from(user)
      .where(eq(user.id, volunteerId));
    // reporterId can be null if the reporter's account was since deleted
    // (reports.reporterId is SET NULL — see reports-schema.ts) — nobody to
    // notify in that case, alerts.userId stays NOT NULL on purpose (a
    // personal notification log, not community content).
    if (report.reporterId) {
      await this.alertsService.create(
        report.reporterId,
        'volunteer_accepted',
        { volunteerName: volunteer?.name ?? null, reportTitle: report.title },
        reportId,
      );
    }

    return this.getRoster(reportId, volunteerId);
  }

  async confirm(
    reportId: string,
    volunteerId: string,
  ): Promise<RosterResponse> {
    const missionId = await this.requireMissionId(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    const mine = rows.find(
      (r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released',
    );
    if (!mine) {
      throw new BadRequestException(
        'Your acceptance window has expired or you never accepted this request — try accepting again',
      );
    }
    if (mine.status.key === 'active')
      return this.getRoster(reportId, volunteerId);

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
    const mine = rows.find(
      (r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released',
    );
    if (!mine)
      throw new BadRequestException(
        'You have no active acceptance on this request',
      );

    const releasedStatusId = await this.getVolunteerStatusIdByKey('released');
    await db
      .update(missionVolunteers)
      .set({
        statusId: releasedStatusId,
        releasedAt: new Date(),
        releaseReason: 'voluntary',
      })
      .where(eq(missionVolunteers.id, mine.mv.id));

    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    const [volunteer] = await db
      .select()
      .from(user)
      .where(eq(user.id, volunteerId));
    if (report?.reporterId) {
      await this.alertsService.create(
        report.reporterId,
        'volunteer_released',
        { volunteerName: volunteer?.name ?? null, reportTitle: report.title },
        reportId,
      );
    }

    return this.getRoster(reportId, volunteerId);
  }

  // accept-and-mission-chat.md — progress status (on_the_way/reached_location/
  // helping_now) is deliberately separate from participation status: only
  // an 'active' volunteer's progress means anything, so this requires that
  // status explicitly rather than just "any non-released row". Each
  // milestone timestamp is set once, the first time it's genuinely reached —
  // re-selecting an earlier status moves progressStatusId but never
  // overwrites an already-recorded timestamp, so real history survives a
  // correction.
  async updateProgress(
    reportId: string,
    volunteerId: string,
    status: ProgressStatusKey,
  ): Promise<RosterResponse> {
    const missionId = await this.requireMissionId(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    // Same filter as confirm()/leave() — a volunteer who left and rejoined
    // has an old released row alongside their current one; matching without
    // excluding released rows can grab the wrong (stale) one.
    const mine = rows.find((r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released');
    if (!mine) {
      throw new ForbiddenException(
        'You are not part of this mission',
      );
    }
    if (mine.status.key !== 'active') {
      throw new BadRequestException(
        'Start Helping before updating your progress',
      );
    }

    const progressStatusId = await this.getProgressStatusIdByKey(status);
    const now = new Date();
    const timestampColumn =
      status === 'on_the_way'
        ? 'onWayAt'
        : status === 'reached_location'
          ? 'reachedAt'
          : 'helpingAt';
    const alreadySet = mine.mv[timestampColumn] !== null;

    await db
      .update(missionVolunteers)
      .set({
        progressStatusId,
        ...(alreadySet ? {} : { [timestampColumn]: now }),
      })
      .where(eq(missionVolunteers.id, mine.mv.id));

    return this.getRoster(reportId, volunteerId);
  }

  // docs/features/mission-completion.md US-1/US-2/BR-1..BR-6.
  async complete(
    reportId: string,
    volunteerId: string,
    photoUrl: string,
    note: string,
  ): Promise<RosterResponse> {
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');
    if (report.reporterId === volunteerId) {
      throw new BadRequestException('You cannot complete your own report');
    }

    const missionId = await this.requireMissionId(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    // Same filter as confirm()/leave() — a volunteer who left and rejoined
    // has an old released row alongside their current one; matching without
    // excluding released rows can grab the wrong (stale) one.
    const mine = rows.find((r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released');
    if (!mine || mine.status.key !== 'active') {
      throw new BadRequestException(
        'You must be an active volunteer on this mission to complete it',
      );
    }

    const [existingCompletion] = await db
      .select()
      .from(missionCompletions)
      .where(eq(missionCompletions.missionId, missionId));
    if (existingCompletion) {
      throw new BadRequestException('This mission has already been completed');
    }

    if (!this.isGenuineUpload(photoUrl)) {
      throw new BadRequestException(
        'The completion photo must be one uploaded through this app',
      );
    }

    const verifiedStatusId = await this.getCompletionStatusIdByKey('verified');
    const completedReportStatusId =
      await this.getReportStatusIdByKey('completed');
    const now = new Date();

    await db.insert(missionCompletions).values({
      id: uuidv7(),
      missionId,
      completedById: volunteerId,
      photoUrl,
      note,
      statusId: verifiedStatusId,
      submittedAt: now,
      verifiedAt: now,
    });

    await db
      .update(reports)
      .set({ statusId: completedReportStatusId, closedAt: now })
      .where(eq(reports.id, reportId));

    const [volunteer] = await db
      .select()
      .from(user)
      .where(eq(user.id, volunteerId));
    if (report.reporterId) {
      await this.alertsService.create(
        report.reporterId,
        'mission_completed',
        { volunteerName: volunteer?.name ?? null, reportTitle: report.title },
        reportId,
      );
    }

    return this.getRoster(reportId, volunteerId);
  }

  async getRoster(
    reportId: string,
    requestingUserId: string,
  ): Promise<RosterResponse> {
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');

    const missionId = await this.findMissionId(reportId);
    if (!missionId) {
      return {
        neededVolunteers: report.neededVolunteers,
        volunteers: [],
        myStatus: null,
        myConfirmDeadline: null,
        myProgressStatus: null,
        completion: null,
      };
    }

    const rows = await this.expireStaleAndListVolunteers(missionId);
    const volunteerIds = [...new Set(rows.map((r) => r.mv.volunteerId).filter((id): id is string => id !== null))];
    const volunteerUsers = volunteerIds.length
      ? await db.select().from(user).where(inArray(user.id, volunteerIds))
      : [];
    const userById = new Map(volunteerUsers.map((u) => [u.id, u]));
    // Mirrors accept()'s own eligibility check: a released row must not
    // keep myStatus stuck non-null forever, or a volunteer who left can
    // never see "I'll Help" again even though accept() would happily let
    // them rejoin (accept-and-mission-chat.md documents re-accepting after
    // release as intended). Only an active (non-released) row counts as
    // "mine" here.
    const mine = rows.find((r) => r.mv.volunteerId === requestingUserId && r.status.key !== 'released');

    const [completionRow] = await db
      .select()
      .from(missionCompletions)
      .where(eq(missionCompletions.missionId, missionId));

    const toProgressStatus = (
      r: (typeof rows)[number],
    ): ProgressStatusInfo | null =>
      r.progress
        ? {
            key: r.progress.key as ProgressStatusKey,
            label: r.progress.label,
            onWayAt: r.mv.onWayAt ? r.mv.onWayAt.toISOString() : null,
            reachedAt: r.mv.reachedAt ? r.mv.reachedAt.toISOString() : null,
            helpingAt: r.mv.helpingAt ? r.mv.helpingAt.toISOString() : null,
          }
        : null;

    return {
      neededVolunteers: report.neededVolunteers,
      volunteers: rows.map((r) => ({
        id: r.mv.id,
        volunteerId: r.mv.volunteerId,
        name: (r.mv.volunteerId ? userById.get(r.mv.volunteerId)?.name : null) ?? 'Deleted User',
        volunteerDeleted: r.mv.volunteerId === null,
        avatarUrl: (r.mv.volunteerId ? userById.get(r.mv.volunteerId)?.avatarUrl : null) ?? null,
        status: r.status.key as VolunteerStatusKey,
        confirmDeadline:
          r.status.key === 'joined' ? r.mv.confirmDeadline.toISOString() : null,
        joinedAt: r.mv.joinedAt.toISOString(),
        progressStatus: toProgressStatus(r),
      })),
      myStatus: mine ? (mine.status.key as VolunteerStatusKey) : null,
      myConfirmDeadline:
        mine && mine.status.key === 'joined'
          ? mine.mv.confirmDeadline.toISOString()
          : null,
      myProgressStatus: mine ? toProgressStatus(mine) : null,
      completion: completionRow
        ? {
            photoUrl: completionRow.photoUrl,
            note: completionRow.note,
            verifiedAt: completionRow.verifiedAt!.toISOString(),
          }
        : null,
    };
  }

  // BR-4: gated on hasActiveAccess, checked here — not just hidden client-side.
  async listMessages(reportId: string, requestingUserId: string) {
    if (!(await this.hasActiveAccess(reportId, requestingUserId))) {
      throw new ForbiddenException(
        'You need to accept this request to view Mission Chat',
      );
    }
    const missionId = await this.requireMissionId(reportId);

    const rows = await db
      .select({ msg: missionMessages, sender: user })
      .from(missionMessages)
      // leftJoin, not innerJoin: a message survives its sender's account
      // deletion (missionMessages.senderId is SET NULL, not cascade) — the
      // body stays visible to the other participant, only the identity goes.
      .leftJoin(user, eq(missionMessages.senderId, user.id))
      .where(eq(missionMessages.missionId, missionId))
      .orderBy(missionMessages.createdAt);

    return rows.map((r) => ({
      id: r.msg.id,
      senderId: r.msg.senderId,
      senderName: r.sender?.name ?? 'Deleted User',
      senderDeleted: r.msg.senderId === null,
      body: r.msg.body,
      createdAt: r.msg.createdAt.toISOString(),
      isMine: r.msg.senderId === requestingUserId,
    }));
  }

  async sendMessage(reportId: string, senderId: string, body: string) {
    if (!(await this.hasActiveAccess(reportId, senderId))) {
      throw new ForbiddenException(
        'You need to accept this request to post in Mission Chat',
      );
    }

    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    if (report) {
      const [status] = await db
        .select()
        .from(reportStatuses)
        .where(eq(reportStatuses.id, report.statusId));
      if (status?.key === 'completed') {
        throw new ForbiddenException(
          'This mission is complete — Mission Chat is read-only',
        );
      }
    }

    const missionId = await this.requireMissionId(reportId);
    await db
      .insert(missionMessages)
      .values({ id: uuidv7(), missionId, senderId, body });
    return this.listMessages(reportId, senderId);
  }

  // My Helps — every mission this user has volunteered for, across all
  // reports. Applies the same lazy timeout check as expireStaleAndListVolunteers,
  // just across a volunteer's rows instead of one mission's.
  async listMyMissions(volunteerId: string): Promise<MyMissionSummary[]> {
    const rows = await db
      .select({
        mv: missionVolunteers,
        status: missionVolunteerStatuses,
        mission: missions,
      })
      .from(missionVolunteers)
      .innerJoin(
        missionVolunteerStatuses,
        eq(missionVolunteers.statusId, missionVolunteerStatuses.id),
      )
      .innerJoin(missions, eq(missionVolunteers.missionId, missions.id))
      .where(eq(missionVolunteers.volunteerId, volunteerId))
      .orderBy(desc(missionVolunteers.joinedAt));

    const now = new Date();
    const stale = rows.filter(
      (r) => r.status.key === 'joined' && r.mv.confirmDeadline < now,
    );
    if (stale.length > 0) {
      const releasedStatusId = await this.getVolunteerStatusIdByKey('released');
      for (const row of stale) {
        await db
          .update(missionVolunteers)
          .set({
            statusId: releasedStatusId,
            releasedAt: now,
            releaseReason: 'timeout',
          })
          .where(eq(missionVolunteers.id, row.mv.id));
        row.status = { ...row.status, key: 'released' };
      }
    }

    if (rows.length === 0) return [];

    // A volunteer who left and rejoined the same mission has more than one
    // mission_volunteers row for the same report — one per accept/release
    // cycle. My Helps must show each report once, not once per historical
    // row. rows is already ordered desc(joinedAt), so keeping the first
    // occurrence per reportId keeps the most recent row — the current
    // active/joined one when one exists, or the most recent release
    // otherwise — and drops the older stale ones.
    const seenReportIds = new Set<string>();
    const dedupedRows = rows.filter((r) => {
      if (seenReportIds.has(r.mission.reportId)) return false;
      seenReportIds.add(r.mission.reportId);
      return true;
    });

    const reportIds = [...new Set(dedupedRows.map((r) => r.mission.reportId))];
    const reportRows = await db
      .select({
        report: reports,
        category: reportCategories,
        status: reportStatuses,
        reporter: user,
      })
      .from(reports)
      .innerJoin(reportCategories, eq(reports.categoryId, reportCategories.id))
      .innerJoin(reportStatuses, eq(reports.statusId, reportStatuses.id))
      .leftJoin(user, eq(reports.reporterId, user.id))
      .where(inArray(reports.id, reportIds));
    const reportById = new Map(reportRows.map((r) => [r.report.id, r]));

    const photoRows = await db
      .select()
      .from(reportPhotos)
      .where(inArray(reportPhotos.reportId, reportIds));
    const firstPhotoByReportId = new Map<string, string>();
    for (const p of photoRows) {
      if (!firstPhotoByReportId.has(p.reportId))
        firstPhotoByReportId.set(p.reportId, p.url);
    }

    // Impact Stories (MyHelpsScreen's own tab, and ImpactStoriesService which
    // reuses this method for the volunteer angle) should show the outcome —
    // the completion's after-photo — not the report's original before-photo.
    // Missions still in progress have no completion row yet, so this map is
    // naturally empty for them and firstPhotoByReportId below still applies.
    const missionIds = dedupedRows.map((r) => r.mission.id);
    const completionRows = await db
      .select({ missionId: missionCompletions.missionId, photoUrl: missionCompletions.photoUrl })
      .from(missionCompletions)
      .where(inArray(missionCompletions.missionId, missionIds));
    const missionIdToReportId = new Map(dedupedRows.map((r) => [r.mission.id, r.mission.reportId]));
    const completionPhotoByReportId = new Map<string, string>();
    for (const c of completionRows) {
      const reportId = missionIdToReportId.get(c.missionId);
      if (reportId) completionPhotoByReportId.set(reportId, c.photoUrl);
    }

    return dedupedRows
      .map((r): MyMissionSummary | null => {
        const found = reportById.get(r.mission.reportId);
        if (!found) return null;
        return {
          reportId: found.report.id,
          title: found.report.title,
          category: {
            key: found.category.key,
            label: found.category.label,
            emoji: found.category.emoji,
          },
          reportStatus: found.status.key,
          photo:
            completionPhotoByReportId.get(found.report.id) ??
            firstPhotoByReportId.get(found.report.id) ??
            null,
          landmark: found.report.landmark,
          lat: found.report.lat,
          lng: found.report.lng,
          reporterName:
            found.report.reporterId === null || found.report.anonymous ? null : (found.reporter?.name ?? null),
          reporterDeleted: found.report.reporterId === null,
          myStatus: r.status.key as VolunteerStatusKey,
          myConfirmDeadline:
            r.status.key === 'joined'
              ? r.mv.confirmDeadline.toISOString()
              : null,
          joinedAt: r.mv.joinedAt.toISOString(),
        };
      })
      .filter((m): m is MyMissionSummary => m !== null);
  }
}
