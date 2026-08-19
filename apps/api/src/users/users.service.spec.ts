import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const service = new UsersService();
  let userId: string;

  beforeAll(async () => {
    userId = uuidv7();
    await db.insert(user).values({
      id: userId,
      name: 'Pending Profile',
      email: `${userId}@test.local`,
      phoneNumber: `+91-${userId}`,
    });
  });

  afterAll(async () => {
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
      expect(new Date(updated.profileCompletedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
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
        avatarUrl: 'http://localhost:3001/uploads/avatar.jpg',
      });

      expect(updated.contactEmail).toBe('contact@test.local');
      expect(updated.language).toBe('Tamil');
      expect(updated.profession).toBe('Nurse');
      expect(updated.organization).toBe('Test Hospital');
      expect(updated.showProfession).toBe(true);
      expect(updated.avatarUrl).toBe('http://localhost:3001/uploads/avatar.jpg');
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
      expect(updated.avatarUrl).toBe('http://localhost:3001/uploads/avatar.jpg');
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
});
