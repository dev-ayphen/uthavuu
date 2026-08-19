import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import type { CompleteProfileDto } from './dto/complete-profile.dto';
import type { UpdateRadiusDto } from './dto/update-radius.dto';

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
}
