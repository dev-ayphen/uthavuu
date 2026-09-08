import { uuidv7 } from 'uuidv7';
import { db } from './index';
import { reportCategories } from './schema/reports-schema';

/**
 * The nine seeded request categories, and the insert-only rule that writes them.
 *
 * Lives in its own file for the same reason `seed-admins.ts` and `seed-audit.ts`
 * do — it is a self-contained unit of the seed with its own policy worth stating
 * once — and for one reason those do not have: this policy is the answer to open
 * question #7, so it is the part of the seed with a test
 * (`report-category-seed.spec.ts`) that runs it twice and asserts an edit made
 * in between survived. A `seed.ts` that calls `process.exit(0)` cannot be
 * imported by a test; an exported function can.
 */
// Matches apps/mobile/src/data/categories.ts exactly (id -> key) — see
// docs/features/report-a-request.md BR-1 (the 8 citizen categories) and BR-2
// (per-category default expiry, in minutes here).
export const CATEGORIES = [
  {
    key: 'animalRescue',
    label: 'Animal Rescue',
    emoji: '🐶',
    defaultExpiryMinutes: 12 * 60,
    citizenSelectable: true,
    expectedLabels: [
      'Animal',
      'Dog',
      'Cat',
      'Bird',
      'Cattle',
      'Livestock',
      'Wildlife',
      'Pet',
      'Animals and Pets',
    ],
  },
  {
    key: 'medicalHelp',
    label: 'Medical Help',
    emoji: '❤️',
    defaultExpiryMinutes: 6 * 60,
    citizenSelectable: true,
    expectedLabels: [
      'Person',
      'Human',
      'Hospital',
      'Clinic',
      'First Aid',
      'Ambulance',
      'Injury',
      'Wound',
      'Medication',
      'Health',
    ],
  },
  {
    key: 'foodDonation',
    label: 'Food Donation',
    emoji: '🍱',
    defaultExpiryMinutes: 12 * 60,
    citizenSelectable: true,
    expectedLabels: [
      'Food',
      'Meal',
      'Groceries',
      'Bread',
      'Rice',
      'Vegetable',
      'Fruit',
      'Box',
      'Package',
      'Bag',
      'Food and Beverage',
    ],
  },
  {
    key: 'roadsideHelp',
    label: 'Roadside Help',
    emoji: '🚗',
    defaultExpiryMinutes: 6 * 60,
    citizenSelectable: true,
    expectedLabels: [
      'Car',
      'Vehicle',
      'Truck',
      'Bus',
      'Motorcycle',
      'Tire',
      'Wheel',
      'Road',
      'Highway',
      'Transportation',
      'Machine',
    ],
  },
  {
    key: 'elderlySupport',
    label: 'Elderly Support',
    emoji: '👴',
    defaultExpiryMinutes: 24 * 60,
    citizenSelectable: true,
    expectedLabels: [
      'Person',
      'Human',
      'Adult',
      'Senior Citizen',
      'Wheelchair',
      'Walking Cane',
      'Face',
      'People',
    ],
  },
  {
    key: 'bloodDonation',
    label: 'Blood Donation',
    emoji: '🩸',
    defaultExpiryMinutes: 4 * 60,
    citizenSelectable: true,
    expectedLabels: [
      'Person',
      'Human',
      'Hospital',
      'Clinic',
      'Blood',
      'Syringe',
      'First Aid',
      'Health',
    ],
  },
  {
    key: 'communityHelp',
    label: 'Community Help',
    emoji: '🤝',
    defaultExpiryMinutes: 72 * 60,
    citizenSelectable: true,
    // Deliberately NO expectedLabels. "Community help" has no characteristic
    // imagery — a broken streetlight, a flooded lane and a stack of donated
    // books are all legitimate — so a relevance rule here would hold real
    // reports and teach moderators to rubber-stamp the queue. Null means the
    // check is skipped, and that is the right answer rather than a missing one.
  },
  {
    key: 'lostAndFound',
    label: 'Lost & Found',
    emoji: '🔍',
    defaultExpiryMinutes: 72 * 60,
    citizenSelectable: true,
    expectedLabels: [
      'Person',
      'Human',
      'Bag',
      'Wallet',
      'Phone',
      'Key',
      'Jewelry',
      'Backpack',
      'Animal',
      'Dog',
      'Cat',
      'Accessories',
    ],
  },
  // BR-3: exists for the schema/admin milestone, not citizen-selectable yet.
  {
    key: 'disasterRelief',
    label: 'Disaster Relief',
    emoji: '🚨',
    defaultExpiryMinutes: 24 * 60,
    citizenSelectable: false,
  },
] as const;

/** How many rows the seed defines, for the summary line in `seed.ts`. */
export const REPORT_CATEGORY_COUNT = CATEGORIES.length;

/**
 * ==================== CATEGORIES ARE INSERT-ONLY ==========================
 * `onConflictDoNothing`, unlike every other lookup table in `seed.ts`. The seed
 * CREATES a category that is missing and NEVER touches one that already exists.
 *
 * WHY THIS TABLE AND NOT THE OTHERS. The test is not "is it a lookup table" —
 * they all are — it is "does anything other than the seed write to it in
 * production?". Exactly one table answers yes: `report_categories` is edited
 * through Platform -> Categories in the admin console
 * (admin/admin-categories.service.ts), so its `label`, `emoji`,
 * `defaultExpiryMinutes` and `citizen_selectable` are an OPERATOR's decisions.
 * Every other lookup table is written by the seed alone. Re-asserting a value
 * nobody else can change is harmless and repairs drift; re-asserting one a human
 * deliberately changed destroys the only copy of their decision — and silently,
 * on an unrelated command, minutes or months later.
 *
 * The old upsert meant an admin who renamed a category watched the rename
 * disappear the next time any developer ran `pnpm db:seed`. That was open
 * question #7; it is now decided.
 *
 * `platform_settings` in `seed.ts` reaches the same conclusion by the same route
 * and has done since it was written — operator-owned, therefore
 * insert-if-absent. This is that rule applied consistently, not a new one.
 *
 * WHAT INSERT-ONLY GIVES UP, STATED PLAINLY: the seed can no longer repair a
 * drifted label, and it can no longer backfill a NEWLY ADDED COLUMN onto
 * existing rows. `expected_labels` (migration 0025) is the live example — the
 * nine rows on the dev database got their values from the old upsert, and a
 * database that gains a column from here on will not be filled in by re-seeding.
 * That is the correct division of labour rather than a regression: backfilling
 * existing rows is what a migration is for, and a seed that also backfills is a
 * migration nobody reviewed, running at unpredictable times. Note the console
 * cannot set `expected_labels` either — `CreateReportCategoryDto` has no such
 * field — so it is seed-or-migration data, never operator data.
 *
 * `key` is the conflict target and remains the identity of a category, which is
 * the other half of why this is safe: a seeded key is matched, found and left
 * alone, so nothing is ever duplicated. It is also why
 * `UpdateReportCategoryDto` refuses to let a key be edited.
 * ==========================================================================
 */
export async function seedReportCategories(): Promise<{ created: number }> {
  let created = 0;

  for (const category of CATEGORIES) {
    const inserted = await db
      .insert(reportCategories)
      .values({
        id: uuidv7(),
        ...category,
        expectedLabels:
          'expectedLabels' in category ? [...category.expectedLabels] : null,
      })
      .onConflictDoNothing({ target: reportCategories.key })
      // So the summary line can tell "created 9" on a fresh database from
      // "created 0" on one an operator has been curating — which is the whole
      // observable difference this policy makes, and the thing someone running
      // the seed straight after an edit will want to see.
      .returning({ id: reportCategories.id });

    created += inserted.length;
  }

  return { created };
}
