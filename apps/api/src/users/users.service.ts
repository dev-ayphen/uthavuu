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
}
