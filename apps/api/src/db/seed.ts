// Master data for lookup tables (CLAUDE.md § Database) — categories and
// statuses live here, not as hardcoded enums. Re-runnable: upserts by `key`,
// never duplicates or fails on a second run.
import 'dotenv/config';
import { uuidv7 } from 'uuidv7';
import { sql } from 'drizzle-orm';
import { db } from './index';
import { reportCategories, reportStatuses } from './schema/reports-schema';
import { photoVerificationStatuses } from './schema/photo-verification-schema';
import {
  missionCompletionStatuses,
  missionVolunteerStatuses,
  progressStatuses,
} from './schema/missions-schema';
import { flagStatuses } from './schema/comments-schema';
import {
  ticketCategories,
  ticketMessageSenderTypes,
  ticketPriorities,
  ticketStatuses,
} from './schema/tickets-schema';
import { userStatuses } from './schema/user-status-schema';
import { communityUpdateStatuses } from './schema/updates-schema';
import {
  sponsorCreativeTypes,
  sponsorStatuses,
} from './schema/sponsors-schema';
import {
  broadcastAudiences,
  broadcastStatuses,
} from './schema/broadcasts-schema';
import {
  PLATFORM_SETTINGS_DEFAULTS,
  platformSettings,
} from './schema/settings-schema';
import { seedAdmins } from './seed-admins';
import { seedAuditCatalogue } from './seed-audit';

// Matches apps/mobile/src/data/categories.ts exactly (id -> key) — see
// docs/features/report-a-request.md BR-1 (the 8 citizen categories) and BR-2
// (per-category default expiry, in minutes here).
const CATEGORIES = [
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

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'expired', label: 'Expired' },
  { key: 'completed', label: 'Completed' },
  // Added with photo verification. Both are PRE-PUBLICATION states: a report
  // holding either one must never appear in a citizen feed, a nearby search, or
  // a volunteer's list. That exclusion is enforced centrally in
  // reports/report-visibility.ts rather than at each call site — the earlier
  // soft-delete leak across six read paths is exactly what happens otherwise.
  { key: 'pending_review', label: 'Pending review' },
  { key: 'rejected', label: 'Rejected' },
] as const;

// Verification lifecycle for a single uploaded photo. `failed` is deliberately
// distinct from `review_required`: both put the photo in front of a human, but
// only one means the provider never answered, and an operator staring at a
// suddenly-full queue needs to tell "the model is flagging things" from
// "Rekognition is down".
const PHOTO_VERIFICATION_STATUSES = [
  { key: 'verifying', label: 'Verifying', sortOrder: 10 },
  { key: 'passed', label: 'Passed', sortOrder: 20 },
  { key: 'review_required', label: 'Review required', sortOrder: 30 },
  { key: 'rejected', label: 'Rejected', sortOrder: 40 },
  { key: 'failed', label: 'Verification failed', sortOrder: 50 },
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

// accept-and-mission-chat.md — what an *active* volunteer is currently
// doing, separate from mission_volunteers.status (whether they're part of
// the mission at all). Only reachable once a volunteer is 'active'.
const PROGRESS_STATUSES = [
  { key: 'on_the_way', label: 'On the Way' },
  { key: 'reached_location', label: 'Reached Location' },
  { key: 'helping_now', label: 'Helping Now' },
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

// Account suspension (db/schema/user-status-schema.ts). Absence of a
// user_account_status row already means 'active', so the 'active' row exists
// for the un-suspend path to write back to — not because anyone starts in it.
const USER_STATUSES = [
  { key: 'active', label: 'Active', sortOrder: 10 },
  { key: 'suspended', label: 'Suspended', sortOrder: 20 },
] as const;

// Help & Support's five-state lifecycle (db/schema/tickets-schema.ts). The code
// branches on these keys via support/ticket-status.ts; this is where the rows
// they resolve to come from.
//
// `new` and `in_review` are GONE FROM THIS LIST BUT NOT FROM THE DATABASE:
// migration 0023 renamed those two rows in place (new -> open, in_review ->
// in_progress) so the tickets already pointing at them kept a meaningful status.
// Re-seeding after that migration updates labels and sort orders on the renamed
// rows and inserts the two genuinely new ones.
const TICKET_STATUSES = [
  { key: 'open', label: 'Open', sortOrder: 10 },
  { key: 'in_progress', label: 'In Progress', sortOrder: 20 },
  { key: 'waiting_for_user', label: 'Waiting for User', sortOrder: 30 },
  // resolved: support believes it is fixed and the citizen may still reply —
  // a reply reopens the ticket. closed: finished, no further messages from
  // either side. Two states, not one, on purpose.
  { key: 'resolved', label: 'Resolved', sortOrder: 40 },
  { key: 'closed', label: 'Closed', sortOrder: 50 },
] as const;

// Triage order. Staff-set only — a citizen filing a ticket always gets `normal`
// (DEFAULT_TICKET_PRIORITY_KEY), because a priority anyone can self-declare
// stops meaning anything by the second week.
const TICKET_PRIORITIES = [
  { key: 'low', label: 'Low', sortOrder: 10 },
  { key: 'normal', label: 'Normal', sortOrder: 20 },
  { key: 'high', label: 'High', sortOrder: 30 },
  { key: 'urgent', label: 'Urgent', sortOrder: 40 },
] as const;

// Which side of a support conversation a message came from. The labels are what
// a reader sees attached to a message, which is why the staff one is "Support"
// rather than "Admin" — the citizen-facing projection never names the individual
// (SupportService.citizenMessages), so this label is the whole attribution.
const TICKET_MESSAGE_SENDER_TYPES = [
  { key: 'user', label: 'Citizen', sortOrder: 10 },
  { key: 'admin', label: 'Support', sortOrder: 20 },
] as const;

// Community → Updates (db/schema/updates-schema.ts). An announcement starts as
// `draft` (invisible to citizens), becomes `published` (visible once publish_at
// arrives), and can be taken out of the feed again with `archived` without
// being deleted.
const COMMUNITY_UPDATE_STATUSES = [
  { key: 'draft', label: 'Draft', sortOrder: 10 },
  { key: 'published', label: 'Published', sortOrder: 20 },
  { key: 'archived', label: 'Archived', sortOrder: 30 },
] as const;

// Monetization -> Sponsors (db/schema/sponsors-schema.ts). The console's five
// status filter tabs, in the order it renders them
// (docs/webadmin/08-monetization.md §3.2).
//
// ⚠️ ONLY `draft`, `active` and `paused` are ever WRITTEN to a sponsor row.
// `scheduled` and `expired` are derived from the campaign window at read time
// (sponsors/sponsor-status.ts) and are seeded so the console's filter has a
// complete catalogue and the derived values have labels to render — the same
// reasoning ADR 0012 gives for using lookup tables at all.
const SPONSOR_STATUSES = [
  { key: 'active', label: 'Active', sortOrder: 10 },
  { key: 'scheduled', label: 'Scheduled', sortOrder: 20 },
  { key: 'paused', label: 'Paused', sortOrder: 30 },
  { key: 'expired', label: 'Expired', sortOrder: 40 },
  { key: 'draft', label: 'Draft', sortOrder: 50 },
] as const;

// What kind of creative the mobile card renders. `logo_text` is the zero-asset
// fallback — logo and description only, no media URL needed.
const SPONSOR_CREATIVE_TYPES = [
  { key: 'video', label: 'Video', sortOrder: 10 },
  { key: 'banner', label: 'Banner', sortOrder: 20 },
  { key: 'logo_text', label: 'Logo & text', sortOrder: 30 },
] as const;

// Community -> Broadcasts (db/schema/broadcasts-schema.ts).
//
// `sending` is not decoration: the send path claims a broadcast by moving it
// into this status conditionally, so two admins pressing Send at once cannot
// both fan out. It is also the state a broadcast is LEFT in when a fan-out dies
// halfway — visible in the console rather than silently reverted, because
// reverting would invite a second send that double-notifies everyone who
// already received the first.
const BROADCAST_STATUSES = [
  { key: 'draft', label: 'Draft', sortOrder: 10 },
  { key: 'scheduled', label: 'Scheduled', sortOrder: 20 },
  { key: 'sending', label: 'Sending', sortOrder: 30 },
  { key: 'sent', label: 'Sent', sortOrder: 40 },
  { key: 'cancelled', label: 'Cancelled', sortOrder: 50 },
] as const;

// ⚠️ SEEDING A THIRD ROW HERE WOULD BREAK THINGS, unlike every other lookup in
// this file. An audience is not a label over existing rows — it names a
// RECIPIENT QUERY, and only the two below have one
// (AdminBroadcastsService.recipientPage). A seeded `city` or `radius` audience
// would appear in the console's dropdown, be selectable, and then fan out to
// nobody while reporting success. Adding an audience is a code change first and
// a seed row second; BROADCAST_AUDIENCE_KEYS in the schema file is the authority.
const BROADCAST_AUDIENCES = [
  { key: 'all_users', label: 'All users', sortOrder: 10 },
  { key: 'district', label: 'A single district', sortOrder: 20 },
] as const;

async function seed() {
  for (const category of CATEGORIES) {
    await db
      .insert(reportCategories)
      .values({
        id: uuidv7(),
        ...category,
        expectedLabels:
          'expectedLabels' in category ? [...category.expectedLabels] : null,
      })
      .onConflictDoUpdate({
        target: reportCategories.key,
        set: {
          label: category.label,
          emoji: category.emoji,
          defaultExpiryMinutes: category.defaultExpiryMinutes,
          citizenSelectable: category.citizenSelectable,
          // Spread-in rather than always-set: categories with no expectations
          // must keep NULL, and writing `undefined` here would leave whatever
          // an operator had configured intact rather than clobbering it.
          ...('expectedLabels' in category
            ? { expectedLabels: [...category.expectedLabels] }
            : {}),
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

  for (const status of PHOTO_VERIFICATION_STATUSES) {
    await db
      .insert(photoVerificationStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: photoVerificationStatuses.key,
        set: {
          label: status.label,
          sortOrder: status.sortOrder,
          updatedAt: sql`now()`,
        },
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

  for (const status of PROGRESS_STATUSES) {
    await db
      .insert(progressStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: progressStatuses.key,
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
        set: {
          label: status.label,
          sortOrder: status.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const priority of TICKET_PRIORITIES) {
    await db
      .insert(ticketPriorities)
      .values({ id: uuidv7(), ...priority })
      .onConflictDoUpdate({
        target: ticketPriorities.key,
        set: {
          label: priority.label,
          sortOrder: priority.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const senderType of TICKET_MESSAGE_SENDER_TYPES) {
    await db
      .insert(ticketMessageSenderTypes)
      .values({ id: uuidv7(), ...senderType })
      .onConflictDoUpdate({
        target: ticketMessageSenderTypes.key,
        set: {
          label: senderType.label,
          sortOrder: senderType.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const status of USER_STATUSES) {
    await db
      .insert(userStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: userStatuses.key,
        set: {
          label: status.label,
          sortOrder: status.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const status of COMMUNITY_UPDATE_STATUSES) {
    await db
      .insert(communityUpdateStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: communityUpdateStatuses.key,
        set: {
          label: status.label,
          sortOrder: status.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const status of SPONSOR_STATUSES) {
    await db
      .insert(sponsorStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: sponsorStatuses.key,
        set: {
          label: status.label,
          sortOrder: status.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const creativeType of SPONSOR_CREATIVE_TYPES) {
    await db
      .insert(sponsorCreativeTypes)
      .values({ id: uuidv7(), ...creativeType })
      .onConflictDoUpdate({
        target: sponsorCreativeTypes.key,
        set: {
          label: creativeType.label,
          sortOrder: creativeType.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const status of BROADCAST_STATUSES) {
    await db
      .insert(broadcastStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: broadcastStatuses.key,
        set: {
          label: status.label,
          sortOrder: status.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  for (const audience of BROADCAST_AUDIENCES) {
    await db
      .insert(broadcastAudiences)
      .values({ id: uuidv7(), ...audience })
      .onConflictDoUpdate({
        target: broadcastAudiences.key,
        set: {
          label: audience.label,
          sortOrder: audience.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }

  // Platform -> App Settings: the single configuration row.
  //
  // onConflictDoNothing, NOT onConflictDoUpdate — the deliberate exception to
  // every other block in this file. The lookup tables above are master data
  // this repo owns, so re-seeding them correctly repairs a drifted label. This
  // row is the opposite: its values are an OPERATOR's, set from the console,
  // and re-running the seed after a deploy must never quietly switch
  // maintenance_mode back off or reset a support phone number somebody
  // published. Insert-if-absent is the only safe upsert for a row the product
  // itself writes.
  //
  // It is also what keeps `updated_at == created_at` meaningful on an untouched
  // row, which is how AdminSettingsService tells "never changed" apart from
  // "changed by an admin whose account was later deleted".
  const settings = await db
    .insert(platformSettings)
    .values({ id: uuidv7(), ...PLATFORM_SETTINGS_DEFAULTS })
    .onConflictDoNothing({ target: platformSettings.singleton })
    .returning({ id: platformSettings.id });

  // Admin RBAC master data + the two console accounts. Lives in its own file
  // because it is the only part of the seed that needs the Better Auth instance
  // (to hash passwords with the same algorithm sign-in verifies them with).
  const admin = await seedAdmins();

  // The audit action/target-type catalogue every mutating /admin route resolves
  // against. Seeded after the admin RBAC rows purely for reading order — it has
  // no dependency on them.
  const audit = await seedAuditCatalogue();

  console.log(
    `Seeded ${CATEGORIES.length} report categories, ${STATUSES.length} report statuses, ${PHOTO_VERIFICATION_STATUSES.length} photo verification statuses, ${MISSION_VOLUNTEER_STATUSES.length} mission volunteer statuses, ${MISSION_COMPLETION_STATUSES.length} mission completion statuses, ${FLAG_STATUSES.length} flag statuses, ${TICKET_CATEGORIES.length} ticket categories, ${TICKET_STATUSES.length} ticket statuses, ${TICKET_PRIORITIES.length} ticket priorities, ${TICKET_MESSAGE_SENDER_TYPES.length} ticket message sender types, ${USER_STATUSES.length} user statuses, ${COMMUNITY_UPDATE_STATUSES.length} community update statuses, ${SPONSOR_STATUSES.length} sponsor statuses, ${SPONSOR_CREATIVE_TYPES.length} sponsor creative types, ${BROADCAST_STATUSES.length} broadcast statuses, ${BROADCAST_AUDIENCES.length} broadcast audiences, ${admin.roles} admin roles, ${admin.permissions} admin permissions, ${admin.admins} admin accounts, ${audit.targetTypes} audit target types, ${audit.actions} audit actions, and ${settings.length === 1 ? 'the platform settings row' : 'the platform settings row (already present)'}.`,
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
