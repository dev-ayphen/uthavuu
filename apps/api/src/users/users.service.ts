import { Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import {
  missions,
  missionVolunteers,
  missionVolunteerStatuses,
} from '../db/schema/missions-schema';
import type { CompleteProfileDto } from './dto/complete-profile.dto';
import type { UpdateRadiusDto } from './dto/update-radius.dto';
import type { UpdateLocaleDto } from './dto/update-locale.dto';
import type { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { assertStoredUpload } from '../uploads/stored-upload';

@Injectable()
export class UsersService {
  async completeProfile(userId: string, input: CompleteProfileDto) {
    // `user.avatar_url` is the third column that takes a photo URL straight
    // from the client, and it had exactly the hole `report_photos.url` did:
    // the DTO runs `z.string().url()`, a syntax check that
    // `http://evil.com/tracker.png` passes. An avatar is rendered wherever a
    // person appears — the mission roster, comment threads, the profile screen
    // — so a poisoned one is fetched by more devices than a report photo, not
    // fewer. Same shared predicate as reports and mission completions; see
    // ../uploads/stored-upload.ts.
    if (input.avatarUrl !== undefined) {
      assertStoredUpload(
        input.avatarUrl,
        'Your profile photo must be one uploaded through this app.',
      );
    }

    // Optional fields (BR-5) only overwrite the column when the client actually
    // sent one — never null out an already-saved value just because a later
    // PATCH call omitted it.
    const [updated] = await db
      .update(user)
      .set({
        name: input.fullName,
        city: input.city,
        district: input.district,
        lastLat: input.lat,
        lastLng: input.lng,
        profileCompletedAt: new Date(),
        ...(input.contactEmail !== undefined && {
          contactEmail: input.contactEmail,
        }),
        ...(input.language !== undefined && { language: input.language }),
        ...(input.profession !== undefined && { profession: input.profession }),
        ...(input.organization !== undefined && {
          organization: input.organization,
        }),
        ...(input.showProfession !== undefined && {
          showProfession: input.showProfession,
        }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      })
      .where(eq(user.id, userId))
      .returning();

    return updated;
  }

  async updateRadius(userId: string, input: UpdateRadiusDto) {
    const [updated] = await db
      .update(user)
      .set({ preferredRadius: input.radius })
      .where(eq(user.id, userId))
      .returning();

    return updated;
  }

  // Settings → Privacy. Pre-fills the *next* report's anonymous/phoneVisible
  // toggles — never touches already-published reports.
  async updatePrivacyDefaults(userId: string, input: UpdatePrivacyDto) {
    const [updated] = await db
      .update(user)
      .set({
        ...(input.defaultAnonymous !== undefined && {
          defaultAnonymous: input.defaultAnonymous,
        }),
        ...(input.defaultPhoneVisible !== undefined && {
          defaultPhoneVisible: input.defaultPhoneVisible,
        }),
      })
      .where(eq(user.id, userId))
      .returning();

    return updated;
  }

  // Settings → Delete Account. PII (name, avatar, phone, contact email —
  // every column on the user row) is genuinely erased: the row is really
  // deleted, not retained-but-hidden. But community activity other people
  // depend on is NOT collateral damage of that deletion:
  //
  //  - A report nobody ever volunteered for is this user's own, personal,
  //    unclaimed data -> soft-deleted via the same mechanism as a manual
  //    Delete Report (reports.deletedAt/deletedBy), never a hard delete.
  //  - A report that has (or ever had) a volunteer is community activity a
  //    volunteer is relying on mid-mission, or a completed record future
  //    Impact Stories read from -> left fully intact. reports.reporterId
  //    becomes NULL via the FK's ON DELETE SET NULL (see reports-schema.ts)
  //    when the user row is deleted below; the client renders that as
  //    "Deleted User", distinct from reports.anonymous ("posted
  //    anonymously") — see ReportsService.toResponse()'s reporterDeleted flag.
  //  - This user's own mission_volunteers rows (them acting as a volunteer
  //    elsewhere) are explicitly released here — not left to the FK alone —
  //    so a still-open slot genuinely reopens for someone else to join, with
  //    releaseReason: 'account_deleted' alongside the existing
  //    'timeout' | 'voluntary' literals.
  //  - mission_completions.completedById, report_comments.authorId, and
  //    mission_messages.senderId are also ON DELETE SET NULL (not cascade):
  //    a completion record, comment, or chat message is preserved for other
  //    participants' context; only the identity is removed, never the body.
  //
  // Everything else — session, account, report_saves, report_comment_flags,
  // devices, support_tickets — is personal, not community-authored, and stays
  // a hard ON DELETE CASCADE.
  //
  // Wrapped in one transaction: the report classification + volunteer
  // release + final user delete must all commit together or not at all.
  async deleteAccount(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Rule 1: soft-delete this user's own reports that no volunteer has
      // EVER joined (including released ones — "ever had a row" is the
      // bar, not "currently has an active volunteer"). Reports with any
      // volunteer history are left alone; their reporterId is anonymized
      // by the FK when the user row is deleted at the end.
      const myReports = await tx
        .select({ id: reports.id })
        .from(reports)
        .where(and(eq(reports.reporterId, userId), isNull(reports.deletedAt)));

      for (const report of myReports) {
        const [missionRow] = await tx
          .select({ id: missions.id })
          .from(missions)
          .where(eq(missions.reportId, report.id));

        let everHadVolunteer = false;
        if (missionRow) {
          const [{ value }] = await tx
            .select({ value: count() })
            .from(missionVolunteers)
            .where(eq(missionVolunteers.missionId, missionRow.id));
          everHadVolunteer = value > 0;
        }

        if (!everHadVolunteer) {
          await tx
            .update(reports)
            .set({ deletedAt: new Date(), deletedBy: userId })
            .where(eq(reports.id, report.id));
        }
      }

      // Rule 5: release this user's own mission_volunteers rows (them as a
      // volunteer on someone else's report) so a not-yet-released slot
      // genuinely reopens, rather than relying on the FK's SET NULL alone
      // (which anonymizes the row but doesn't change its status).
      const [releasedStatus] = await tx
        .select({ id: missionVolunteerStatuses.id })
        .from(missionVolunteerStatuses)
        .where(eq(missionVolunteerStatuses.key, 'released'));

      const myVolunteerRows = await tx
        .select({
          id: missionVolunteers.id,
          statusId: missionVolunteers.statusId,
        })
        .from(missionVolunteers)
        .where(eq(missionVolunteers.volunteerId, userId));

      for (const mv of myVolunteerRows) {
        if (releasedStatus && mv.statusId !== releasedStatus.id) {
          await tx
            .update(missionVolunteers)
            .set({
              statusId: releasedStatus.id,
              releasedAt: new Date(),
              releaseReason: 'account_deleted',
            })
            .where(eq(missionVolunteers.id, mv.id));
        }
      }

      // Real hard delete of the account itself. See the comment block above
      // for exactly which FKs cascade vs. SET NULL from here.
      await tx.delete(user).where(eq(user.id, userId));
    });
  }

  // Reported by the client whenever the in-app language changes, so push
  // notifications — the one alert surface the server has to render prose for
  // itself — go out in the language the user actually reads.
  async updateLocale(userId: string, input: UpdateLocaleDto) {
    const [updated] = await db
      .update(user)
      .set({ locale: input.locale })
      .where(eq(user.id, userId))
      .returning();

    return updated;
  }

  // docs/PRODUCT-DECISIONS.md Decision 1 endorses "successful reports" /
  // "resolution reliability" as real trust indicators — but reliability
  // needs completion data that doesn't exist yet (mission completion is a
  // deliberately separate, not-yet-built feature). These two counts are
  // exactly what's honestly computable today: real totals, no invented
  // success/reliability rate.
  async getStats(userId: string) {
    const [reportsRow] = await db
      .select({ value: count() })
      .from(reports)
      .where(eq(reports.reporterId, userId));
    const [missionsRow] = await db
      .select({ value: count() })
      .from(missionVolunteers)
      .where(eq(missionVolunteers.volunteerId, userId));

    return {
      reportsCount: reportsRow?.value ?? 0,
      missionsCount: missionsRow?.value ?? 0,
    };
  }

  // Profile → Invite Friends. Lazy-generate-on-first-request, same shape as
  // MissionsService's lazy status checks: nothing to do until someone
  // actually asks, and once generated the code never changes (a copied link
  // must keep working). No claim/attribution endpoint — product decision
  // (2026-08-24): v1 is a genuine shareable invite only, no referral
  // tracking, since there's no public landing page yet for a claim flow to
  // land on (apps/marketing isn't built).
  async getOrCreateInvite(
    userId: string,
  ): Promise<{ code: string; link: string }> {
    const [existing] = await db
      .select({ inviteCode: user.inviteCode })
      .from(user)
      .where(eq(user.id, userId));
    if (existing?.inviteCode) {
      return {
        code: existing.inviteCode,
        link: inviteLink(existing.inviteCode),
      };
    }

    // Collision retry rather than a single attempt — an 8-char base32 code
    // has a large but non-zero collision chance at scale; the unique index
    // on invite_code is the real guarantee, this loop just avoids surfacing
    // a 500 to the user on the rare collision instead of silently trusting
    // one random draw.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomInviteCode();
      try {
        await db
          .update(user)
          .set({ inviteCode: code })
          .where(eq(user.id, userId));
        return { code, link: inviteLink(code) };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new Error('Could not generate a unique invite code after 5 attempts');
  }
}

// Excludes visually-ambiguous characters (0/O, 1/I) since this is meant to
// be read aloud or typed, not just tapped/shared as a link.
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomInviteCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code +=
      INVITE_CODE_ALPHABET[
        Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)
      ];
  }
  return code;
}

// uthavu.org doesn't serve an /invite route yet — no apps/marketing exists
// in this repo (App Profile: "add it when marketing work starts"). This is
// a known, accepted v1 limitation, not a bug: the link is real and
// copy/share-able today, it just has nowhere to land until that surface is
// built. Revisit this constant once it does.
function inviteLink(code: string): string {
  return `https://uthavu.org/invite/${code}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === '23505'
  );
}
