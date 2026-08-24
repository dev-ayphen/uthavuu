// Master data for lookup tables (CLAUDE.md § Database) — categories and
// statuses live here, not as hardcoded enums. Re-runnable: upserts by `key`,
// never duplicates or fails on a second run.
import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { sql } from 'drizzle-orm';
import { db } from './index';
import { reportCategories, reportStatuses } from './schema/reports-schema';
import { missionCompletionStatuses, missionVolunteerStatuses } from './schema/missions-schema';
import { flagStatuses } from './schema/comments-schema';
import { ticketCategories, ticketStatuses } from './schema/tickets-schema';

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

// Profile → Flagged Comments. No admin console exists yet to move a flag
// past 'submitted' — the lifecycle is modeled for real regardless, so the
// mobile screen shows an honest status and a future admin build has
// somewhere real to write to.
const FLAG_STATUSES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'action_taken', label: 'Action Taken' },
  { key: 'dismissed', label: 'Dismissed' },
] as const;

// Profile → Help & Support / Submit Ticket. Matches
// apps/mobile/src/screens/tabs/ProfileScreen.tsx's TICKET_CATEGORIES array
// key-for-key (key -> label) — that array is the real, already-designed UI,
// this just gives each option a stable lookup-table key.
const TICKET_CATEGORIES = [
  { key: 'technical_problem', label: 'Technical Problem' },
  { key: 'bug_report', label: 'Bug Report' },
  { key: 'account_problem', label: 'Account Problem' },
  { key: 'feature_request', label: 'Feature Request' },
  { key: 'complaint', label: 'Complaint' },
  { key: 'other', label: 'Other' },
] as const;

const TICKET_STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'in_review', label: 'In Review' },
  { key: 'resolved', label: 'Resolved' },
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

  for (const status of FLAG_STATUSES) {
    await db
      .insert(flagStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: flagStatuses.key,
        set: { label: status.label, updatedAt: sql`now()` },
      });
  }

  for (const category of TICKET_CATEGORIES) {
    await db
      .insert(ticketCategories)
      .values({ id: uuidv7(), ...category })
      .onConflictDoUpdate({
        target: ticketCategories.key,
        set: { label: category.label, updatedAt: sql`now()` },
      });
  }

  for (const status of TICKET_STATUSES) {
    await db
      .insert(ticketStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: ticketStatuses.key,
        set: { label: status.label, updatedAt: sql`now()` },
      });
  }

  console.log(
    `Seeded ${CATEGORIES.length} report categories, ${STATUSES.length} report statuses, ${MISSION_VOLUNTEER_STATUSES.length} mission volunteer statuses, ${MISSION_COMPLETION_STATUSES.length} mission completion statuses, ${FLAG_STATUSES.length} flag statuses, ${TICKET_CATEGORIES.length} ticket categories, and ${TICKET_STATUSES.length} ticket statuses.`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
