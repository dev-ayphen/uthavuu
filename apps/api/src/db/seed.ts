// Master data for lookup tables (CLAUDE.md § Database) — categories and
// statuses live here, not as hardcoded enums. Re-runnable: upserts by `key`,
// never duplicates or fails on a second run.
import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { sql } from 'drizzle-orm';
import { db } from './index';
import { reportCategories, reportStatuses } from './schema/reports-schema';
import { missionCompletionStatuses, missionVolunteerStatuses } from './schema/missions-schema';

// Matches apps/mobile/src/data/categories.ts exactly (id -> key) — see
// docs/features/report-a-request.md BR-1 (the 8 citizen categories) and BR-2
// (per-category default expiry, in minutes here).
const CATEGORIES = [
  { key: 'animalRescue', label: 'Animal Rescue', emoji: '🐶', defaultExpiryMinutes: 12 * 60, citizenSelectable: true },
  { key: 'medicalHelp', label: 'Medical Help', emoji: '❤️', defaultExpiryMinutes: 6 * 60, citizenSelectable: true },
  { key: 'foodDonation', label: 'Food Donation', emoji: '🍱', defaultExpiryMinutes: 12 * 60, citizenSelectable: true },
  { key: 'roadsideHelp', label: 'Roadside Help', emoji: '🚗', defaultExpiryMinutes: 6 * 60, citizenSelectable: true },
  { key: 'elderlySupport', label: 'Elderly Support', emoji: '👴', defaultExpiryMinutes: 24 * 60, citizenSelectable: true },
  { key: 'bloodDonation', label: 'Blood Donation', emoji: '🩸', defaultExpiryMinutes: 4 * 60, citizenSelectable: true },
  { key: 'communityHelp', label: 'Community Help', emoji: '🤝', defaultExpiryMinutes: 72 * 60, citizenSelectable: true },
  { key: 'lostAndFound', label: 'Lost & Found', emoji: '🔍', defaultExpiryMinutes: 72 * 60, citizenSelectable: true },
  // BR-3: exists for the schema/admin milestone, not citizen-selectable yet.
  { key: 'disasterRelief', label: 'Disaster Relief', emoji: '🚨', defaultExpiryMinutes: 24 * 60, citizenSelectable: false },
] as const;

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'expired', label: 'Expired' },
  { key: 'completed', label: 'Completed' },
] as const;

// accept-and-mission-chat.md — a volunteer's own participation state, not
// the report's status.
const MISSION_VOLUNTEER_STATUSES = [
  { key: 'joined', label: 'Joined' },
  { key: 'active', label: 'Active' },
  { key: 'released', label: 'Released' },
] as const;

// mission-completion.md — a mission's own completion state, distinct from
// mission_volunteers.status (each volunteer's participation) and from
// report_statuses (the report's own lifecycle).
const MISSION_COMPLETION_STATUSES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'waiting_verification', label: 'Waiting Verification' },
  { key: 'verified', label: 'Verified' },
] as const;

async function seed() {
  for (const category of CATEGORIES) {
    await db
      .insert(reportCategories)
      .values({ id: uuidv7(), ...category })
      .onConflictDoUpdate({
        target: reportCategories.key,
        set: {
          label: category.label,
          emoji: category.emoji,
          defaultExpiryMinutes: category.defaultExpiryMinutes,
          citizenSelectable: category.citizenSelectable,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const status of STATUSES) {
    await db
      .insert(reportStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: reportStatuses.key,
        set: { label: status.label, updatedAt: sql`now()` },
      });
  }

  for (const status of MISSION_VOLUNTEER_STATUSES) {
    await db
      .insert(missionVolunteerStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: missionVolunteerStatuses.key,
        set: { label: status.label, updatedAt: sql`now()` },
      });
  }

  for (const status of MISSION_COMPLETION_STATUSES) {
    await db
      .insert(missionCompletionStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: missionCompletionStatuses.key,
        set: { label: status.label, updatedAt: sql`now()` },
      });
  }

  console.log(
    `Seeded ${CATEGORIES.length} report categories, ${STATUSES.length} report statuses, ${MISSION_VOLUNTEER_STATUSES.length} mission volunteer statuses, and ${MISSION_COMPLETION_STATUSES.length} mission completion statuses.`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
