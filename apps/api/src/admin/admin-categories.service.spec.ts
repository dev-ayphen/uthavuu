import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';

// See admin/testing/admin-spec-db.ts: the factory is hoisted above the imports,
// so the database name has to be a literal here.
jest.mock('../db', () => {
  const postgresModule =
    jest.requireActual<typeof import('postgres')>('postgres');
  const drizzleModule = jest.requireActual<
    typeof import('drizzle-orm/postgres-js')
  >('drizzle-orm/postgres-js');
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/uthavu_report_categories_test';
  return { db: drizzleModule.drizzle(postgresModule(url.toString())) };
});

import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reports } from '../db/schema/reports-schema';
import { AdminAuditService } from './admin-audit.service';
import { AdminCategoriesService } from './admin-categories.service';
import {
  createSpecDatabase,
  fakeAdmin,
  seedLookups,
  type SeededLookups,
} from './testing/admin-spec-db';

const DATABASE = 'uthavu_report_categories_test';
const META = { ipAddress: null, userAgent: null };

/**
 * Platform -> Categories: the ordering contract, and the two refusals that stop
 * an admin from breaking the mobile app.
 */
describe('AdminCategoriesService', () => {
  let service: AdminCategoriesService;
  let lookups: SeededLookups;
  const adminId = uuidv7();
  const admin = fakeAdmin({ userId: adminId, email: 'admin@uthavu.org' });

  const keysInOrder = async () => (await service.list()).map((row) => row.key);

  /** Put the table back to what seedLookups created, between cases. */
  const resetCategories = async () => {
    await db.delete(reports);
    await db.delete(reportCategories);
    await db.insert(reportCategories).values([
      {
        id: lookups.categoryIds.medicalHelp,
        key: 'medicalHelp',
        label: 'Medical Help',
        emoji: '❤️',
        defaultExpiryMinutes: 360,
        citizenSelectable: true,
      },
      {
        id: lookups.categoryIds.animalRescue,
        key: 'animalRescue',
        label: 'Animal Rescue',
        emoji: '🐶',
        defaultExpiryMinutes: 720,
        citizenSelectable: true,
      },
      {
        id: lookups.categoryIds.disasterRelief,
        key: 'disasterRelief',
        label: 'Disaster Relief',
        emoji: '🚨',
        defaultExpiryMinutes: 1440,
        citizenSelectable: false,
      },
    ]);
  };

  beforeAll(async () => {
    await createSpecDatabase(DATABASE);
    lookups = await seedLookups(db);
    await db.insert(user).values({
      id: adminId,
      name: 'Spec Admin',
      email: 'admin@uthavu.org',
      phoneNumber: `+91-${adminId}`,
    });
    service = new AdminCategoriesService(new AdminAuditService());
  });

  afterAll(async () => {
    await db.$client.end();
  });

  beforeEach(resetCategories);

  describe('list() ordering', () => {
    it('sorts alphabetically by label, not by key', async () => {
      // The two disagree, which is the entire point of choosing one: by KEY the
      // order is animalRescue < disasterRelief < medicalHelp; by LABEL it is
      // Animal Rescue < Disaster Relief < Medical Help. Those happen to match
      // here, so the case below forces them apart.
      await db
        .update(reportCategories)
        .set({ label: 'Zebra Rescue' })
        .where(eq(reportCategories.key, 'animalRescue'));

      // By key, animalRescue would still come first. By label it is now last.
      expect(await keysInOrder()).toEqual([
        'disasterRelief',
        'medicalHelp',
        'animalRescue',
      ]);
    });

    it('orders case-insensitively and keeps accents beside their base letter', async () => {
      // A plain byte comparison — which is what `order by label` degrades to on
      // this Postgres, see report-category-order.ts — would give
      // "Medical" < "animal" < "Élan" here. The ICU collation is what makes the
      // list read the way a human alphabetises.
      await db
        .update(reportCategories)
        .set({ label: 'animal rescue' })
        .where(eq(reportCategories.key, 'animalRescue'));
      await db
        .update(reportCategories)
        .set({ label: 'Élan Support' })
        .where(eq(reportCategories.key, 'disasterRelief'));

      expect(await keysInOrder()).toEqual([
        'animalRescue', // "animal rescue"
        'disasterRelief', // "Élan Support"
        'medicalHelp', // "Medical Help"
      ]);
    });

    it('is stable when two categories share a label, via the key tiebreaker', async () => {
      // `label` has no unique constraint, so this is a state the schema permits.
      // Without the `key` tiebreaker the executor could return these two in
      // either order, and the two surfaces could each get a different one.
      await db
        .update(reportCategories)
        .set({ label: 'Same Label' })
        .where(eq(reportCategories.key, 'medicalHelp'));
      await db
        .update(reportCategories)
        .set({ label: 'Same Label' })
        .where(eq(reportCategories.key, 'animalRescue'));

      // animalRescue < medicalHelp by key, every time.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(await keysInOrder()).toEqual([
          'disasterRelief',
          'animalRescue',
          'medicalHelp',
        ]);
      }
    });
  });

  describe('delete() — CATEGORY_IN_USE', () => {
    const reportIn = async (categoryId: string, deleted = false) => {
      await db.insert(reports).values({
        id: uuidv7(),
        reporterId: adminId,
        categoryId,
        statusId: lookups.reportStatusIds.open,
        title: 'Spec report',
        description: 'Spec report',
        lat: 13.08,
        lng: 80.27,
        expiryAt: new Date(Date.now() + 3_600_000),
        deletedAt: deleted ? new Date() : null,
      });
    };

    it('refuses a category that reports reference', async () => {
      await reportIn(lookups.categoryIds.medicalHelp);

      await expect(
        service.delete(lookups.categoryIds.medicalHelp, admin, META),
      ).rejects.toMatchObject({
        response: { code: 'CATEGORY_IN_USE', reportCount: 1 },
      });
    });

    it('counts SOFT-DELETED reports too — the foreign key does not care', async () => {
      // list()'s human-facing reportCount excludes these; the delete check must
      // not, or the operator gets a foreign-key 500 instead of a 409.
      await reportIn(lookups.categoryIds.medicalHelp, true);

      await expect(
        service.delete(lookups.categoryIds.medicalHelp, admin, META),
      ).rejects.toMatchObject({
        response: { code: 'CATEGORY_IN_USE', reportCount: 1 },
      });
    });
  });

  describe('delete() — CATEGORY_LAST_REMAINING', () => {
    it('refuses the last citizen-selectable category', async () => {
      await service.delete(lookups.categoryIds.animalRescue, admin, META);

      // medicalHelp is now the only citizen-selectable row. disasterRelief still
      // exists, so the table is NOT empty — which is exactly why the rule is
      // phrased over citizen-selectable rows rather than over rows.
      await expect(
        service.delete(lookups.categoryIds.medicalHelp, admin, META),
      ).rejects.toMatchObject({
        response: { code: 'CATEGORY_LAST_REMAINING' },
      });

      const survivors = await keysInOrder();
      expect(survivors).toContain('medicalHelp');
    });

    it('still allows deleting an admin-only category, even as the last row', async () => {
      await service.delete(lookups.categoryIds.animalRescue, admin, META);
      await service
        .delete(lookups.categoryIds.medicalHelp, admin, META)
        .catch(() => undefined);
      // medicalHelp is protected; disasterRelief is not, because removing it
      // cannot reduce the citizen-selectable count.
      await expect(
        service.delete(lookups.categoryIds.disasterRelief, admin, META),
      ).resolves.toMatchObject({ deleted: true });
    });

    it('reports the last-remaining refusal ahead of the in-use one', async () => {
      // Both refusals apply to this row. CATEGORY_IN_USE's advice is "set
      // citizenSelectable to false instead" — which the PATCH guard would also
      // refuse, so leading with it would send the operator down a dead end.
      await service.delete(lookups.categoryIds.animalRescue, admin, META);
      await db.insert(reports).values({
        id: uuidv7(),
        reporterId: adminId,
        categoryId: lookups.categoryIds.medicalHelp,
        statusId: lookups.reportStatusIds.open,
        title: 'Spec report',
        description: 'Spec report',
        lat: 13.08,
        lng: 80.27,
        expiryAt: new Date(Date.now() + 3_600_000),
      });

      await expect(
        service.delete(lookups.categoryIds.medicalHelp, admin, META),
      ).rejects.toMatchObject({
        response: { code: 'CATEGORY_LAST_REMAINING' },
      });
    });

    /**
     * The reason the guard takes row locks rather than running a `count(*)`.
     *
     * Both transactions start while two citizen-selectable categories exist, so
     * an unlocked count would read 2 in each and let both deletes through,
     * leaving zero. `FOR UPDATE` serialises them: the second re-evaluates after
     * the first commits, sees one row left, and refuses.
     */
    it('lets only one of two concurrent deletes of the last two succeed', async () => {
      const results = await Promise.allSettled([
        service.delete(lookups.categoryIds.medicalHelp, admin, META),
        service.delete(lookups.categoryIds.animalRescue, admin, META),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({
        response: { code: 'CATEGORY_LAST_REMAINING' },
      });

      // The invariant itself, asserted against the database rather than inferred
      // from the two outcomes: a citizen still has something to post under.
      const citizenSelectable = await db
        .select({ id: reportCategories.id })
        .from(reportCategories)
        .where(eq(reportCategories.citizenSelectable, true));
      expect(citizenSelectable).toHaveLength(1);
    });
  });

  describe('update() — the same invariant, reached through PATCH', () => {
    it('refuses to clear citizenSelectable on the last citizen-selectable category', async () => {
      await service.delete(lookups.categoryIds.animalRescue, admin, META);

      await expect(
        service.update(
          lookups.categoryIds.medicalHelp,
          admin,
          { citizenSelectable: false },
          META,
        ),
      ).rejects.toMatchObject({
        response: { code: 'CATEGORY_LAST_REMAINING' },
      });

      const [row] = await db
        .select()
        .from(reportCategories)
        .where(eq(reportCategories.id, lookups.categoryIds.medicalHelp));
      expect(row.citizenSelectable).toBe(true);
    });

    it('allows clearing it while another citizen-selectable category remains', async () => {
      await expect(
        service.update(
          lookups.categoryIds.medicalHelp,
          admin,
          { citizenSelectable: false },
          META,
        ),
      ).resolves.toMatchObject({ citizenSelectable: false });
    });

    it('does not take the guard path for an edit that leaves the flag alone', async () => {
      await service.delete(lookups.categoryIds.animalRescue, admin, META);

      // medicalHelp is now the last citizen-selectable category, but renaming it
      // does not reduce the count, so it must still be editable.
      await expect(
        service.update(
          lookups.categoryIds.medicalHelp,
          admin,
          { label: 'Medical Assistance' },
          META,
        ),
      ).resolves.toMatchObject({ label: 'Medical Assistance' });
    });
  });
});
