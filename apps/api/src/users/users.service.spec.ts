import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import {
  removeUploadFixture,
  writeUploadFixture,
} from '../uploads/testing/upload-fixture';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const service = new UsersService();
  let userId: string;
  // completeProfile() now refuses an avatarUrl that no upload produced — the
  // same hole report_photos.url had (docs/_audit/issues.md issue 27), and a
  // worse one, since an avatar renders wherever a person appears. So the
  // fixture has to be a real file, not a plausible string.
  const AVATAR_FIXTURE = 'users-service-spec-avatar.jpg';
  let avatarUrl: string;

  beforeAll(async () => {
    avatarUrl = writeUploadFixture(AVATAR_FIXTURE);
    userId = uuidv7();
    await db.insert(user).values({
      id: userId,
      name: 'Pending Profile',
      email: `${userId}@test.local`,
      phoneNumber: `+91-${userId}`,
    });
  });

  afterAll(async () => {
    removeUploadFixture(AVATAR_FIXTURE);
    await db.delete(user).where(eq(user.id, userId));
  });

  describe('completeProfile()', () => {
    it('sets the required fields and stamps profileCompletedAt', async () => {
      const before = Date.now();
      const updated = await service.completeProfile(userId, {
        fullName: 'Test User',
        lat: 13.08,
        lng: 80.27,
        city: 'Chennai',
        district: 'Chennai',
      });

      expect(updated.name).toBe('Test User');
      expect(updated.city).toBe('Chennai');
      expect(updated.district).toBe('Chennai');
      expect(updated.lastLat).toBe(13.08);
      expect(updated.lastLng).toBe(80.27);
      expect(updated.profileCompletedAt).not.toBeNull();
      expect(
        new Date(updated.profileCompletedAt as Date).getTime(),
      ).toBeGreaterThanOrEqual(before);
    });

    it('sets optional fields when provided', async () => {
      const updated = await service.completeProfile(userId, {
        fullName: 'Test User',
        lat: 13.08,
        lng: 80.27,
        city: 'Chennai',
        district: 'Chennai',
        contactEmail: 'contact@test.local',
        language: 'Tamil',
        profession: 'Nurse',
        organization: 'Test Hospital',
        showProfession: true,
        avatarUrl,
      });

      expect(updated.contactEmail).toBe('contact@test.local');
      expect(updated.language).toBe('Tamil');
      expect(updated.profession).toBe('Nurse');
      expect(updated.organization).toBe('Test Hospital');
      expect(updated.showProfession).toBe(true);
      expect(updated.avatarUrl).toBe(avatarUrl);
    });

    it('does not overwrite previously-set optional fields when they are omitted (undefined) on a later call', async () => {
      // Reuses the contactEmail/profession/etc. set in the previous test —
      // this call omits all of them, simulating a partial update (e.g. the
      // client only re-submitting fullName/lat/lng/city/district).
      const updated = await service.completeProfile(userId, {
        fullName: 'Test User Renamed',
        lat: 13.09,
        lng: 80.28,
        city: 'Chennai',
        district: 'Chennai',
      });

      expect(updated.name).toBe('Test User Renamed');
      expect(updated.lastLat).toBe(13.09);
      // None of these were in this call's input -> must remain what the
      // previous test set them to, not be nulled out.
      expect(updated.contactEmail).toBe('contact@test.local');
      expect(updated.language).toBe('Tamil');
      expect(updated.profession).toBe('Nurse');
      expect(updated.organization).toBe('Test Hospital');
      expect(updated.showProfession).toBe(true);
      expect(updated.avatarUrl).toBe(avatarUrl);
    });
  });

  describe('updateRadius()', () => {
    it('persists the new preferred radius', async () => {
      const updated = await service.updateRadius(userId, { radius: 5 });
      expect(updated.preferredRadius).toBe(5);

      const updatedAgain = await service.updateRadius(userId, { radius: 10 });
      expect(updatedAgain.preferredRadius).toBe(10);
    });
  });

  describe('updatePrivacyDefaults()', () => {
    it('updates only the field(s) actually sent, leaving the other untouched', async () => {
      const afterFirst = await service.updatePrivacyDefaults(userId, {
        defaultAnonymous: true,
      });
      expect(afterFirst.defaultAnonymous).toBe(true);
      expect(afterFirst.defaultPhoneVisible).toBe(false);

      const afterSecond = await service.updatePrivacyDefaults(userId, {
        defaultPhoneVisible: true,
      });
      expect(afterSecond.defaultAnonymous).toBe(true);
      expect(afterSecond.defaultPhoneVisible).toBe(true);
    });
  });

  describe('deleteAccount()', () => {
    it('permanently removes the user row', async () => {
      const throwawayId = uuidv7();
      await db.insert(user).values({
        id: throwawayId,
        name: 'Throwaway',
        email: `${throwawayId}@test.local`,
        phoneNumber: `+91-${throwawayId}`,
      });

      await service.deleteAccount(throwawayId);

      const [remaining] = await db
        .select()
        .from(user)
        .where(eq(user.id, throwawayId));
      expect(remaining).toBeUndefined();
    });
  });
});
