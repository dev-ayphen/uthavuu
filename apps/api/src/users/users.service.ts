import { Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reports } from '../db/schema/reports-schema';
import { missionVolunteers } from '../db/schema/missions-schema';
import type { CompleteProfileDto } from './dto/complete-profile.dto';
import type { UpdateRadiusDto } from './dto/update-radius.dto';
import type { UpdateLocaleDto } from './dto/update-locale.dto';

@Injectable()
export class UsersService {
  async completeProfile(userId: string, input: CompleteProfileDto) {
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
        ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail }),
        ...(input.language !== undefined && { language: input.language }),
        ...(input.profession !== undefined && { profession: input.profession }),
        ...(input.organization !== undefined && { organization: input.organization }),
        ...(input.showProfession !== undefined && { showProfession: input.showProfession }),
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
    const [reportsRow] = await db.select({ value: count() }).from(reports).where(eq(reports.reporterId, userId));
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
  async getOrCreateInvite(userId: string): Promise<{ code: string; link: string }> {
    const [existing] = await db.select({ inviteCode: user.inviteCode }).from(user).where(eq(user.id, userId));
    if (existing?.inviteCode) {
      return { code: existing.inviteCode, link: inviteLink(existing.inviteCode) };
    }

    // Collision retry rather than a single attempt — an 8-char base32 code
    // has a large but non-zero collision chance at scale; the unique index
    // on invite_code is the real guarantee, this loop just avoids surfacing
    // a 500 to the user on the rare collision instead of silently trusting
    // one random draw.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomInviteCode();
      try {
        await db.update(user).set({ inviteCode: code }).where(eq(user.id, userId));
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
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
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
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}
