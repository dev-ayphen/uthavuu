# Accept and Mission Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a citizen accept an open report (with a capacity cap), confirm within a 15-minute
window or lose the slot, and coordinate with the reporter via a private, server-gated Mission
Chat — closing the Report → Discover → **Accept** gap in the core loop.

**Architecture:** A new `apps/api/src/missions/` NestJS module owns acceptance, the 15-minute
confirm window (checked lazily, no background job), and chat — sitting alongside the existing
`apps/api/src/reports/` module rather than inside it. Mobile gets one new stack screen (Request
Details) composed from small child components, following the same pattern `ReportFlowScreen` used
for its step components.

**Tech Stack:** NestJS + Drizzle + PostgreSQL (Docker), `uuidv7` for ids, `nestjs-zod` DTOs, Expo/
React Native + `@tanstack/react-query`, existing shared component library (`Button`, `TextField`,
`Card`, `Avatar`, `BackButton`, `ToggleRow`) and `theme/tokens.ts`.

**Spec:** [`docs/features/accept-and-mission-chat.md`](../../features/accept-and-mission-chat.md)

## Global Constraints

- No raw hex colors or magic-number spacing/sizing in any mobile file — use `COLORS`/`TYPE`/
  `SPACING`/`RADIUS`/`ICON_SIZE`/`TONES` from `apps/mobile/src/theme/tokens.ts`.
- No files over ~250 lines — split into focused components/files (established pattern: see
  `apps/mobile/src/screens/report/` for the precedent).
- Never use `db:push` — every schema change is `db:generate` then `db:migrate`, committed.
- UUIDv7 primary keys for every new table, generated via `uuidv7()` at insert time (Postgres 16
  here has no native `uuidv7()`).
- Status/lookup values live in DB lookup tables, never hardcoded enums (CLAUDE.md § Database).
- The 15-minute confirm deadline is enforced **lazily only** — no BullMQ/Redis job (explicit
  product-owner decision, BR-3 in the spec).
- Access to Mission Chat and the reporter's phone number is gated **server-side**, in the service
  layer, on every read/write — never only hidden in the UI (BR-4; this is a named CLAUDE.md
  security-boundary requirement).
- No moderation/flagging and no mission-completion logic in this build (spec's Out of scope).
- After every backend code change: `docker compose up -d --build api` from the repo root, then
  verify with real `curl` calls against `http://localhost:3001` — the same way `report-a-request`
  and `discover-nearby-requests` were verified. OTP codes for test logins print via
  `docker compose logs api` (ADR 0007's dev-console fallback).

---

## Task 1: Database schema — `missions` tables + `reports.neededVolunteers`

**Files:**
- Create: `apps/api/src/db/schema/missions-schema.ts`
- Modify: `apps/api/src/db/schema/reports-schema.ts`
- Modify: `apps/api/src/db/index.ts`

**Interfaces:**
- Produces: `missions`, `missionVolunteerStatuses`, `missionVolunteers`, `missionMessages` Drizzle
  tables (and their relations) — every later backend task imports from
  `apps/api/src/db/schema/missions-schema.ts`. `reports.neededVolunteers` (integer, default 1) —
  every later task that reads/writes a report uses this exact column name.

- [ ] **Step 1: Add `neededVolunteers` to the reports table**

In `apps/api/src/db/schema/reports-schema.ts`, add one column to the existing `reports` table
definition (inside the same `pgTable('reports', { ... })` object, alongside `phoneVisible`):

```ts
  // accept-and-mission-chat.md BR-1/BR-2: fixed at creation, 1–20, default 1 (solo mission).
  neededVolunteers: integer('needed_volunteers').default(1).notNull(),
```

`integer` is already imported in that file (used by `defaultExpiryMinutes`), so no new import is
needed.

- [ ] **Step 2: Create the missions schema file**

```ts
// apps/api/src/db/schema/missions-schema.ts
// docs/features/accept-and-mission-chat.md. `missions` is intentionally
// thin — no status column here, mission-level lifecycle status is deferred
// to the mission-completion feature (see the spec's Data touched section).
// `mission_volunteers.status` tracks only each volunteer's own
// participation (joined -> active -> released), not the mission's.
import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

export const missions = pgTable('missions', {
  id: uuid('id').primaryKey(),
  reportId: uuid('report_id')
    .notNull()
    .unique()
    .references(() => reports.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const missionVolunteerStatuses = pgTable('mission_volunteer_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const missionVolunteers = pgTable(
  'mission_volunteers',
  {
    id: uuid('id').primaryKey(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    volunteerId: text('volunteer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => missionVolunteerStatuses.id),
    // BR-3: joinedAt + 15 minutes, checked lazily — never a scheduled job.
    confirmDeadline: timestamp('confirm_deadline', { withTimezone: true }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    // 'timeout' | 'voluntary' — not a lookup table, just two known literals
    // used internally; never rendered to a user as raw text.
    releaseReason: text('release_reason'),
  },
  (table) => [
    index('mission_volunteers_mission_id_idx').on(table.missionId),
    index('mission_volunteers_volunteer_id_idx').on(table.volunteerId),
  ]
);

export const missionMessages = pgTable(
  'mission_messages',
  {
    id: uuid('id').primaryKey(),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('mission_messages_mission_id_idx').on(table.missionId)]
);

export const missionRelations = relations(missions, ({ one, many }) => ({
  report: one(reports, { fields: [missions.reportId], references: [reports.id] }),
  volunteers: many(missionVolunteers),
  messages: many(missionMessages),
}));

export const missionVolunteerRelations = relations(missionVolunteers, ({ one }) => ({
  mission: one(missions, { fields: [missionVolunteers.missionId], references: [missions.id] }),
  volunteer: one(user, { fields: [missionVolunteers.volunteerId], references: [user.id] }),
  status: one(missionVolunteerStatuses, {
    fields: [missionVolunteers.statusId],
    references: [missionVolunteerStatuses.id],
  }),
}));

export const missionMessageRelations = relations(missionMessages, ({ one }) => ({
  mission: one(missions, { fields: [missionMessages.missionId], references: [missions.id] }),
  sender: one(user, { fields: [missionMessages.senderId], references: [user.id] }),
}));
```

- [ ] **Step 3: Merge the new schema into `db/index.ts`**

```ts
// apps/api/src/db/index.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as authSchema from './schema/auth-schema';
import * as reportsSchema from './schema/reports-schema';
import * as missionsSchema from './schema/missions-schema';

const schema = { ...authSchema, ...reportsSchema, ...missionsSchema };

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
```

- [ ] **Step 4: Generate and run the migration**

```bash
cd apps/api
pnpm db:generate
pnpm db:migrate
```

Expected: a new file under `apps/api/drizzle/000X_*.sql` containing `CREATE TABLE "missions"`,
`"mission_volunteer_statuses"`, `"mission_volunteers"`, `"mission_messages"`, and
`ALTER TABLE "reports" ADD COLUMN "needed_volunteers"`. `db:migrate` prints
`[✓] migrations applied successfully!`.

- [ ] **Step 5: Verify the tables exist**

```bash
docker exec uthavu-postgres psql -U uthavu -d uthavu_dev -c "\d mission_volunteers"
```

Expected: column list matching the schema above (`mission_id`, `volunteer_id`, `status_id`,
`confirm_deadline`, `joined_at`, `confirmed_at`, `released_at`, `release_reason`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema/missions-schema.ts apps/api/src/db/schema/reports-schema.ts \
  apps/api/src/db/index.ts apps/api/drizzle/
git commit -m "feat(api): add missions/mission_volunteers/mission_messages schema + reports.neededVolunteers"
```

---

## Task 2: Seed `mission_volunteer_statuses`

**Files:**
- Modify: `apps/api/src/db/seed.ts`

**Interfaces:**
- Consumes: `missionVolunteerStatuses` from Task 1.
- Produces: three seeded rows with keys `joined`, `active`, `released` — every later backend task
  looks these up by key via `MissionsService`'s status-lookup helper (Task 4).

- [ ] **Step 1: Add the missions import and status list**

In `apps/api/src/db/seed.ts`, add to the imports:

```ts
import { missionVolunteerStatuses, reportCategories, reportStatuses } from './schema/reports-schema';
```

Wait — `reportCategories`/`reportStatuses` already come from `reports-schema.ts`;
`missionVolunteerStatuses` comes from the new file. Use two import lines:

```ts
import { reportCategories, reportStatuses } from './schema/reports-schema';
import { missionVolunteerStatuses } from './schema/missions-schema';
```

Add the status list near the existing `STATUSES` constant:

```ts
const MISSION_VOLUNTEER_STATUSES = [
  { key: 'joined', label: 'Joined' },
  { key: 'active', label: 'Active' },
  { key: 'released', label: 'Released' },
] as const;
```

- [ ] **Step 2: Seed them in `seed()`, following the existing upsert pattern**

Add this loop into the `seed()` function, after the existing `STATUSES` loop and before
`console.log(...)`:

```ts
  for (const status of MISSION_VOLUNTEER_STATUSES) {
    await db
      .insert(missionVolunteerStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: missionVolunteerStatuses.key,
        set: { label: status.label, updatedAt: sql`now()` },
      });
  }
```

Update the final log line to include the new count:

```ts
  console.log(
    `Seeded ${CATEGORIES.length} report categories, ${STATUSES.length} report statuses, and ${MISSION_VOLUNTEER_STATUSES.length} mission volunteer statuses.`
  );
```

- [ ] **Step 3: Run it and verify**

```bash
cd apps/api
pnpm db:seed
docker exec uthavu-postgres psql -U uthavu -d uthavu_dev -c "select key, label from mission_volunteer_statuses order by key;"
```

Expected: `active`, `joined`, `released` rows.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/seed.ts
git commit -m "feat(api): seed mission_volunteer_statuses lookup"
```

---

## Task 3: `neededVolunteers` on report creation (backend)

**Files:**
- Modify: `apps/api/src/reports/dto/create-report.dto.ts`
- Modify: `apps/api/src/reports/reports.service.ts`

**Interfaces:**
- Produces: `CreateReportDto.neededVolunteers?: number` (1–20). `ReportsService.toResponse(...)`
  output gains a `neededVolunteers: number` field — every later task that reads a report response
  (mobile `Report` type in Task 8, `RequestDetailsScreen` in Task 10) relies on this field name.

- [ ] **Step 1: Add the field to the DTO**

In `apps/api/src/reports/dto/create-report.dto.ts`, add to `CreateReportSchema`:

```ts
  // accept-and-mission-chat.md BR-1: 1–20, default 1 (solo mission), fixed after publish in v1.
  neededVolunteers: z.number().int().min(1).max(20).optional().default(1),
```

- [ ] **Step 2: Pass it through in `create()`**

In `apps/api/src/reports/reports.service.ts`, inside `create()`'s `db.insert(reports).values({...})`
call, add:

```ts
        neededVolunteers: input.neededVolunteers,
```

- [ ] **Step 3: Include it in `toResponse()`**

In the same file's `toResponse()` method, add to the returned object (near `phoneVisible`):

```ts
      neededVolunteers: report.neededVolunteers,
```

- [ ] **Step 4: Type-check, rebuild, and verify**

```bash
cd apps/api
npx tsc --noEmit -p tsconfig.json
cd ..
docker compose up -d --build api
```

Then, using a real dev-OTP login (request `POST /api/auth/phone-number/send-otp`, read the code
via `docker compose logs api`, `POST /api/auth/phone-number/verify` to get a bearer token — same
flow used throughout this project):

```bash
curl -s -X POST http://localhost:3001/reports \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"categoryKey":"foodDonation","title":"Test","description":"Test","lat":13.08,"lng":80.27,"neededVolunteers":4,"photoUrls":["http://localhost:3001/uploads/test.jpg"]}'
```

Expected: the response JSON includes `"neededVolunteers":4`. Close this test report afterward
(`POST /reports/:id/close`) so it doesn't linger as fake open data.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/dto/create-report.dto.ts apps/api/src/reports/reports.service.ts
git commit -m "feat(api): accept neededVolunteers on report creation"
```

---

## Task 4: `MissionsService` — accept / confirm / leave / roster

**Files:**
- Create: `apps/api/src/missions/missions.service.ts`

**Interfaces:**
- Consumes: `reports`, `reportStatuses` from `reports-schema.ts`; `missions`,
  `missionVolunteers`, `missionVolunteerStatuses` from `missions-schema.ts`; `user` from
  `auth-schema.ts`; `uuidv7` from the `uuidv7` package.
- Produces (exact names/types used by Task 5's controller and Task 6's chat methods):
  - `accept(reportId: string, volunteerId: string): Promise<RosterResponse>`
  - `confirm(reportId: string, volunteerId: string): Promise<RosterResponse>`
  - `leave(reportId: string, volunteerId: string): Promise<RosterResponse>`
  - `getRoster(reportId: string, requestingUserId: string): Promise<RosterResponse>`
  - `hasActiveAccess(reportId: string, userId: string): Promise<boolean>` (used by Task 6)
  - `RosterResponse = { neededVolunteers: number; volunteers: RosterVolunteer[]; myStatus: 'joined' | 'active' | 'released' | null; myConfirmDeadline: string | null }`
  - `RosterVolunteer = { id: string; volunteerId: string; name: string; avatarUrl: string | null; status: 'joined' | 'active' | 'released'; confirmDeadline: string | null; joinedAt: string }`

- [ ] **Step 1: Write the service**

```ts
// apps/api/src/missions/missions.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportStatuses, reports } from '../db/schema/reports-schema';
import { missionVolunteerStatuses, missionVolunteers, missions } from '../db/schema/missions-schema';

type VolunteerStatusKey = 'joined' | 'active' | 'released';

type RosterVolunteer = {
  id: string;
  volunteerId: string;
  name: string;
  avatarUrl: string | null;
  status: VolunteerStatusKey;
  confirmDeadline: string | null;
  joinedAt: string;
};

type RosterResponse = {
  neededVolunteers: number;
  volunteers: RosterVolunteer[];
  myStatus: VolunteerStatusKey | null;
  myConfirmDeadline: string | null;
};

const CONFIRM_WINDOW_MS = 15 * 60_000;

@Injectable()
export class MissionsService {
  private async getVolunteerStatusIdByKey(key: VolunteerStatusKey): Promise<string> {
    const [status] = await db
      .select()
      .from(missionVolunteerStatuses)
      .where(eq(missionVolunteerStatuses.key, key));
    if (!status) throw new Error(`mission_volunteer_statuses row missing for key "${key}" — did db:seed run?`);
    return status.id;
  }

  private async getOrCreateMission(reportId: string): Promise<string> {
    const [existing] = await db.select().from(missions).where(eq(missions.reportId, reportId));
    if (existing) return existing.id;

    const id = uuidv7();
    await db.insert(missions).values({ id, reportId });
    return id;
  }

  private async findMissionId(reportId: string): Promise<string | null> {
    const [mission] = await db.select().from(missions).where(eq(missions.reportId, reportId));
    return mission?.id ?? null;
  }

  // BR-3: the 15-minute deadline is checked here, lazily, every time a
  // mission's volunteers are read or acted on — never by a scheduled job.
  // Any 'joined' row past its deadline is rewritten to 'released' before
  // the caller sees it.
  private async expireStaleAndListVolunteers(missionId: string) {
    const rows = await db
      .select({ mv: missionVolunteers, status: missionVolunteerStatuses })
      .from(missionVolunteers)
      .innerJoin(missionVolunteerStatuses, eq(missionVolunteers.statusId, missionVolunteerStatuses.id))
      .where(eq(missionVolunteers.missionId, missionId));

    const now = new Date();
    const stale = rows.filter((r) => r.status.key === 'joined' && r.mv.confirmDeadline < now);
    if (stale.length === 0) return rows;

    const releasedStatusId = await this.getVolunteerStatusIdByKey('released');
    for (const row of stale) {
      await db
        .update(missionVolunteers)
        .set({ statusId: releasedStatusId, releasedAt: now, releaseReason: 'timeout' })
        .where(eq(missionVolunteers.id, row.mv.id));
    }

    return db
      .select({ mv: missionVolunteers, status: missionVolunteerStatuses })
      .from(missionVolunteers)
      .innerJoin(missionVolunteerStatuses, eq(missionVolunteers.statusId, missionVolunteerStatuses.id))
      .where(eq(missionVolunteers.missionId, missionId));
  }

  // BR-4: the reporter, or a volunteer currently 'joined'/'active' (not
  // 'released'). Used to gate both Mission Chat (Task 6) and the phone
  // reveal (Task 7).
  async hasActiveAccess(reportId: string, userId: string): Promise<boolean> {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) return false;
    if (report.reporterId === userId) return true;

    const missionId = await this.findMissionId(reportId);
    if (!missionId) return false;

    const rows = await this.expireStaleAndListVolunteers(missionId);
    return rows.some((r) => r.mv.volunteerId === userId && r.status.key !== 'released');
  }

  async accept(reportId: string, volunteerId: string): Promise<RosterResponse> {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');
    if (report.reporterId === volunteerId) {
      throw new BadRequestException('You cannot accept your own report');
    }

    const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.id, report.statusId));
    if (status?.key !== 'open') throw new BadRequestException('This request is no longer open');

    const missionId = await this.getOrCreateMission(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    const activeRows = rows.filter((r) => r.status.key !== 'released');

    if (activeRows.some((r) => r.mv.volunteerId === volunteerId)) {
      throw new BadRequestException('You already accepted this request');
    }
    if (activeRows.length >= report.neededVolunteers) {
      throw new BadRequestException('Volunteer limit reached for this request');
    }

    const joinedStatusId = await this.getVolunteerStatusIdByKey('joined');
    const now = new Date();
    await db.insert(missionVolunteers).values({
      id: uuidv7(),
      missionId,
      volunteerId,
      statusId: joinedStatusId,
      confirmDeadline: new Date(now.getTime() + CONFIRM_WINDOW_MS),
      joinedAt: now,
    });

    return this.getRoster(reportId, volunteerId);
  }

  async confirm(reportId: string, volunteerId: string): Promise<RosterResponse> {
    const missionId = await this.findMissionId(reportId);
    if (!missionId) throw new NotFoundException('No mission exists yet for this report');

    const rows = await this.expireStaleAndListVolunteers(missionId);
    const mine = rows.find((r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released');
    if (!mine) {
      throw new BadRequestException(
        'Your acceptance window has expired or you never accepted this request — try accepting again'
      );
    }
    if (mine.status.key === 'active') return this.getRoster(reportId, volunteerId);

    const activeStatusId = await this.getVolunteerStatusIdByKey('active');
    await db
      .update(missionVolunteers)
      .set({ statusId: activeStatusId, confirmedAt: new Date() })
      .where(eq(missionVolunteers.id, mine.mv.id));

    return this.getRoster(reportId, volunteerId);
  }

  async leave(reportId: string, volunteerId: string): Promise<RosterResponse> {
    const missionId = await this.findMissionId(reportId);
    if (!missionId) throw new NotFoundException('No mission exists yet for this report');

    const rows = await this.expireStaleAndListVolunteers(missionId);
    const mine = rows.find((r) => r.mv.volunteerId === volunteerId && r.status.key !== 'released');
    if (!mine) throw new BadRequestException('You have no active acceptance on this request');

    const releasedStatusId = await this.getVolunteerStatusIdByKey('released');
    await db
      .update(missionVolunteers)
      .set({ statusId: releasedStatusId, releasedAt: new Date(), releaseReason: 'voluntary' })
      .where(eq(missionVolunteers.id, mine.mv.id));

    return this.getRoster(reportId, volunteerId);
  }

  async getRoster(reportId: string, requestingUserId: string): Promise<RosterResponse> {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');

    const missionId = await this.findMissionId(reportId);
    if (!missionId) {
      return { neededVolunteers: report.neededVolunteers, volunteers: [], myStatus: null, myConfirmDeadline: null };
    }

    const rows = await this.expireStaleAndListVolunteers(missionId);
    const volunteerIds = [...new Set(rows.map((r) => r.mv.volunteerId))];
    const volunteerUsers = volunteerIds.length
      ? await db.select().from(user).where(inArray(user.id, volunteerIds))
      : [];
    const userById = new Map(volunteerUsers.map((u) => [u.id, u]));
    const mine = rows.find((r) => r.mv.volunteerId === requestingUserId);

    return {
      neededVolunteers: report.neededVolunteers,
      volunteers: rows.map((r) => ({
        id: r.mv.id,
        volunteerId: r.mv.volunteerId,
        name: userById.get(r.mv.volunteerId)?.name ?? 'Volunteer',
        avatarUrl: userById.get(r.mv.volunteerId)?.avatarUrl ?? null,
        status: r.status.key as VolunteerStatusKey,
        confirmDeadline: r.status.key === 'joined' ? r.mv.confirmDeadline.toISOString() : null,
        joinedAt: r.mv.joinedAt.toISOString(),
      })),
      myStatus: mine ? (mine.status.key as VolunteerStatusKey) : null,
      myConfirmDeadline: mine && mine.status.key === 'joined' ? mine.mv.confirmDeadline.toISOString() : null,
    };
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/api
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors. (This service has no controller/module yet, so it isn't reachable over HTTP
until Task 5 — that's fine, this task's deliverable is verified by Task 13's automated test, which
imports and calls this service directly.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/missions/missions.service.ts
git commit -m "feat(api): MissionsService — accept/confirm/leave/roster with lazy 15-min expiry"
```

---

## Task 5: `MissionsController` + module — accept/confirm/leave/roster endpoints

**Files:**
- Create: `apps/api/src/missions/missions.controller.ts`
- Create: `apps/api/src/missions/missions.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `MissionsService` from Task 4.
- Produces: `POST /reports/:id/volunteers`, `PATCH /reports/:id/volunteers/me`,
  `DELETE /reports/:id/volunteers/me`, `GET /reports/:id/volunteers` — Task 8's mobile API client
  calls these exact routes.

- [ ] **Step 1: Write the controller**

```ts
// apps/api/src/missions/missions.controller.ts
import { Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { auth } from '../auth/auth';
import { MissionsService } from './missions.service';

@Controller('reports/:id')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Post('volunteers')
  accept(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.accept(id, session.user.id);
  }

  @Patch('volunteers/me')
  confirm(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.confirm(id, session.user.id);
  }

  @Delete('volunteers/me')
  leave(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.leave(id, session.user.id);
  }

  @Get('volunteers')
  roster(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.getRoster(id, session.user.id);
  }
}
```

- [ ] **Step 2: Write the module**

```ts
// apps/api/src/missions/missions.module.ts
import { Module } from '@nestjs/common';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  controllers: [MissionsController],
  providers: [MissionsService],
})
export class MissionsModule {}
```

- [ ] **Step 3: Register it in `app.module.ts`**

```ts
import { MissionsModule } from './missions/missions.module';
```

Add `MissionsModule` to the `imports` array, after `ReportsModule`.

- [ ] **Step 4: Type-check, rebuild, and verify the full accept → confirm → leave → capacity flow**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ..
docker compose up -d --build api
```

Using two distinct dev-OTP logins (two different phone numbers) to get `$REPORTER_TOKEN` and
`$VOLUNTEER_TOKEN`:

```bash
# Reporter creates a report needing 1 volunteer
REPORT_ID=$(curl -s -X POST http://localhost:3001/reports \
  -H "Authorization: Bearer $REPORTER_TOKEN" -H "Content-Type: application/json" \
  -d '{"categoryKey":"medicalHelp","title":"Test accept flow","description":"Test","lat":13.08,"lng":80.27,"neededVolunteers":1,"photoUrls":["http://localhost:3001/uploads/test.jpg"]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

# Reporter cannot accept their own report
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/volunteers -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: 400 "You cannot accept your own report"

# Volunteer accepts
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/volunteers -H "Authorization: Bearer $VOLUNTEER_TOKEN"
# Expected: 200, myStatus "joined", myConfirmDeadline ~15 min from now

# Volunteer confirms
curl -s -X PATCH http://localhost:3001/reports/$REPORT_ID/volunteers/me -H "Authorization: Bearer $VOLUNTEER_TOKEN"
# Expected: myStatus "active"

# A third volunteer is rejected — neededVolunteers is 1 and it's already filled
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/volunteers -H "Authorization: Bearer $THIRD_TOKEN"
# Expected: 400 "Volunteer limit reached for this request"

# Volunteer leaves
curl -s -X DELETE http://localhost:3001/reports/$REPORT_ID/volunteers/me -H "Authorization: Bearer $VOLUNTEER_TOKEN"
# Expected: myStatus "released", roster volunteer entry shows status "released"

# Now the third volunteer CAN join — the slot freed up
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/volunteers -H "Authorization: Bearer $THIRD_TOKEN"
# Expected: 200, myStatus "joined"

curl -s -X POST http://localhost:3001/reports/$REPORT_ID/close -H "Authorization: Bearer $REPORTER_TOKEN"
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/missions/missions.controller.ts apps/api/src/missions/missions.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): mission volunteer accept/confirm/leave/roster endpoints"
```

---

## Task 6: Mission Chat — endpoints

**Files:**
- Modify: `apps/api/src/missions/missions.service.ts`
- Create: `apps/api/src/missions/dto/send-message.dto.ts`
- Modify: `apps/api/src/missions/missions.controller.ts`

**Interfaces:**
- Consumes: `hasActiveAccess` from Task 4.
- Produces: `MissionsService.listMessages(reportId, requestingUserId): Promise<MissionMessage[]>`,
  `MissionsService.sendMessage(reportId, senderId, body): Promise<MissionMessage[]>`, where
  `MissionMessage = { id: string; senderId: string; senderName: string; body: string; createdAt: string; isMine: boolean }`.
  Routes `GET /reports/:id/messages`, `POST /reports/:id/messages` — Task 8's mobile client and
  Task 12's `MissionChat` component use these exact names/routes.

- [ ] **Step 1: Add the DTO**

```ts
// apps/api/src/missions/dto/send-message.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(2000),
});

export class SendMessageDto extends createZodDto(SendMessageSchema) {}
```

- [ ] **Step 2: Add chat methods to `MissionsService`**

Add these imports to `missions.service.ts`:

```ts
import { ForbiddenException } from '@nestjs/common'; // add ForbiddenException to the existing import
import { missionMessages } from '../db/schema/missions-schema'; // add to the existing schema import
```

Add these methods to the class:

```ts
  private async requireMissionId(reportId: string): Promise<string> {
    const missionId = await this.findMissionId(reportId);
    if (!missionId) throw new NotFoundException('No mission exists yet for this report');
    return missionId;
  }

  // BR-4: gated on hasActiveAccess, checked here — not just hidden client-side.
  async listMessages(reportId: string, requestingUserId: string) {
    if (!(await this.hasActiveAccess(reportId, requestingUserId))) {
      throw new ForbiddenException('You need to accept this request to view Mission Chat');
    }
    const missionId = await this.requireMissionId(reportId);

    const rows = await db
      .select({ msg: missionMessages, sender: user })
      .from(missionMessages)
      .innerJoin(user, eq(missionMessages.senderId, user.id))
      .where(eq(missionMessages.missionId, missionId))
      .orderBy(missionMessages.createdAt);

    return rows.map((r) => ({
      id: r.msg.id,
      senderId: r.msg.senderId,
      senderName: r.sender.name,
      body: r.msg.body,
      createdAt: r.msg.createdAt.toISOString(),
      isMine: r.msg.senderId === requestingUserId,
    }));
  }

  async sendMessage(reportId: string, senderId: string, body: string) {
    if (!(await this.hasActiveAccess(reportId, senderId))) {
      throw new ForbiddenException('You need to accept this request to post in Mission Chat');
    }
    const missionId = await this.requireMissionId(reportId);
    await db.insert(missionMessages).values({ id: uuidv7(), missionId, senderId, body });
    return this.listMessages(reportId, senderId);
  }
```

Note: a report with no mission yet (nobody has accepted) has no chat at all — `requireMissionId`
throws `NotFoundException` even for the reporter. That's correct, not a bug: there's nothing to
coordinate about until someone has accepted (matches the spec's screens note that chat only exists
inside a mission, never as a standalone inbox).

- [ ] **Step 3: Add routes to the controller**

```ts
import { SendMessageDto } from './dto/send-message.dto';
import { Body } from '@nestjs/common'; // add Body to the existing import
```

```ts
  @Get('messages')
  messages(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.missionsService.listMessages(id, session.user.id);
  }

  @Post('messages')
  send(
    @Session() session: UserSession<typeof auth>,
    @Param('id') id: string,
    @Body() body: SendMessageDto
  ) {
    return this.missionsService.sendMessage(id, session.user.id, body.body);
  }
```

- [ ] **Step 4: Type-check, rebuild, and verify gating**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ..
docker compose up -d --build api
```

```bash
# Set up: reporter creates a report, one volunteer accepts and confirms (see Task 5's flow)
# A user who never accepted tries to read chat — must be rejected, not empty-200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/reports/$REPORT_ID/messages -H "Authorization: Bearer $BYSTANDER_TOKEN"
# Expected: 403

# The confirmed volunteer can post
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/messages -H "Authorization: Bearer $VOLUNTEER_TOKEN" -H "Content-Type: application/json" -d '{"body":"On my way"}'
# Expected: 200, message list includes it, isMine true for the volunteer

# The reporter can read it too
curl -s http://localhost:3001/reports/$REPORT_ID/messages -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: 200, same message, isMine false for the reporter

# The volunteer leaves, then tries to post again — must now be rejected
curl -s -X DELETE http://localhost:3001/reports/$REPORT_ID/volunteers/me -H "Authorization: Bearer $VOLUNTEER_TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/reports/$REPORT_ID/messages -H "Authorization: Bearer $VOLUNTEER_TOKEN" -H "Content-Type: application/json" -d '{"body":"still there?"}'
# Expected: 403
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/missions/
git commit -m "feat(api): mission chat, gated on reporter-or-active-volunteer"
```

---

## Task 7: Expose phone reveal + roster summary via existing report reads

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`

**Interfaces:**
- Consumes: `MissionsService.hasActiveAccess` (Task 4).
- Produces: `ReportsService.findOne(...)`'s `reporterPhone` field now also unlocks for an active
  volunteer, not just the owner.

- [ ] **Step 1: Inject `MissionsService` into `ReportsService`**

Add the import and constructor:

```ts
import { MissionsService } from '../missions/missions.service';
```

```ts
@Injectable()
export class ReportsService {
  constructor(private readonly missionsService: MissionsService) {}
  // ...existing methods unchanged...
```

- [ ] **Step 2: Update the phone-reveal rule in `toResponse()`**

`toResponse()` is currently synchronous and called from several places. Change its phone-reveal
line from:

```ts
      reporterPhone: isOwner || report.phoneVisible ? reporter.phoneNumber : null,
```

to accept a pre-computed flag instead of computing it inline, since "is this requester an active
volunteer" requires an async DB call that `toResponse` itself shouldn't own:

```ts
      reporterPhone: isOwner || (hasActiveVolunteerAccess && report.phoneVisible) ? reporter.phoneNumber : null,
```

Add `hasActiveVolunteerAccess: boolean` as a new parameter to `toResponse(...)` (after
`requestingUserId`), and update every call site (`findOne`, `list`) to pass it:

In `findOne(reportId, requestingUserId)`, before the `return this.toResponse(...)` call, add:

```ts
    const hasActiveVolunteerAccess = await this.missionsService.hasActiveAccess(reportId, requestingUserId);
```

and pass it as the new final argument to `toResponse(...)`.

In `list(...)`, do the same inside the `rows.map(...)` — but `hasActiveAccess` is async and
`.map()` can't `await` per-item cleanly, so change that line to:

```ts
    return Promise.all(
      rows.map(async (row) => ({
        ...this.toResponse(
          row.report,
          row.category,
          row.status,
          photosByReportId.get(row.report.id) ?? [],
          row.reporter,
          requestingUserId,
          await this.missionsService.hasActiveAccess(row.report.id, requestingUserId)
        ),
        distanceKm: Math.round(Number(row.distanceKm) * 10) / 10,
      }))
    );
```

`create()`'s call to `this.findOne(created.id, reporterId)` needs no change — `findOne` now
handles the flag internally.

- [ ] **Step 3: Register the dependency**

In `apps/api/src/reports/reports.module.ts`, import `MissionsModule` and add it to `imports` so
Nest can inject `MissionsService`:

```ts
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [MissionsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

Also export `MissionsService` from `MissionsModule` (add `exports: [MissionsService]` to its
`@Module({...})` decorator in `missions.module.ts`).

- [ ] **Step 4: Type-check, rebuild, verify**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ..
docker compose up -d --build api
```

```bash
# Reporter creates a report with phoneVisible true, a volunteer accepts+confirms
# Before confirming: GET /reports/:id as the volunteer shows reporterPhone: null
# After confirming: GET /reports/:id as the volunteer shows the real phone number
# A bystander who never accepted always sees reporterPhone: null regardless of phoneVisible
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/
git commit -m "feat(api): extend phone reveal to active mission volunteers"
```

---

## Task 8: Mobile — `api/missions.ts` client

**Files:**
- Create: `apps/mobile/src/api/missions.ts`
- Modify: `apps/mobile/src/api/reports.ts`

**Interfaces:**
- Produces: `acceptRequest`, `confirmRequest`, `leaveRequest`, `getRoster`, `listMissionMessages`,
  `sendMissionMessage` functions and `Roster`, `RosterVolunteer`, `MissionMessage` types — Task 10
  (`RequestDetailsScreen`), Task 11 (`RosterSection`), and Task 12 (`MissionChat`) all import from
  this file. `Report` type (in `api/reports.ts`) gains `neededVolunteers: number`.

- [ ] **Step 1: Add `neededVolunteers` to the existing `Report`/`CreateReportInput` types**

In `apps/mobile/src/api/reports.ts`, add to the `Report` type:

```ts
  neededVolunteers: number;
```

and to `CreateReportInput`:

```ts
  neededVolunteers?: number;
```

- [ ] **Step 2: Write the missions API client**

```ts
// apps/mobile/src/api/missions.ts
// Matches apps/api/src/missions/* — see docs/features/accept-and-mission-chat.md.
import { apiRequest } from '../lib/api';

export type VolunteerStatus = 'joined' | 'active' | 'released';

export type RosterVolunteer = {
  id: string;
  volunteerId: string;
  name: string;
  avatarUrl: string | null;
  status: VolunteerStatus;
  confirmDeadline: string | null;
  joinedAt: string;
};

export type Roster = {
  neededVolunteers: number;
  volunteers: RosterVolunteer[];
  myStatus: VolunteerStatus | null;
  myConfirmDeadline: string | null;
};

export type MissionMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

export function getRoster(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers`, { method: 'GET', auth: true });
}

export function acceptRequest(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers`, { method: 'POST', auth: true });
}

export function confirmRequest(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers/me`, { method: 'PATCH', auth: true });
}

export function leaveRequest(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers/me`, { method: 'DELETE', auth: true });
}

export function listMissionMessages(reportId: string): Promise<MissionMessage[]> {
  return apiRequest(`/reports/${reportId}/messages`, { method: 'GET', auth: true });
}

export function sendMissionMessage(reportId: string, body: string): Promise<MissionMessage[]> {
  return apiRequest(`/reports/${reportId}/messages`, {
    method: 'POST',
    auth: true,
    body: { body },
  });
}
```

- [ ] **Step 3: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors (nothing calls these yet, but they must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/api/missions.ts apps/mobile/src/api/reports.ts
git commit -m "feat(mobile): missions API client"
```

---

## Task 9: Mobile — `neededVolunteers` UI in the report flow

**Files:**
- Create: `apps/mobile/src/components/Stepper.tsx`
- Modify: `apps/mobile/src/screens/report/reportDraft.ts`
- Modify: `apps/mobile/src/screens/report/steps/DetailsStep.tsx`
- Modify: `apps/mobile/src/screens/report/ReportFlowScreen.tsx`

**Interfaces:**
- Produces: `<Stepper value min max onChange>` — a generic reusable component. `ReportDraft`
  gains `neededVolunteers: number` (default 1).

- [ ] **Step 1: Write the `Stepper` component**

```tsx
// apps/mobile/src/components/Stepper.tsx
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '../theme/tokens';

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

// A generic +/- numeric stepper — first used by the report flow's
// "how many volunteers do you need" field, but generic enough to reuse
// wherever a small bounded count needs editing.
export default function Stepper({ value, min, max, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.button, value <= min && styles.buttonDisabled]}
        onPress={() => value > min && onChange(value - 1)}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel="Decrease"
      >
        <Minus size={ICON_SIZE.sm} color={value <= min ? colors.disabled : colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.value}>{value}</Text>
      <TouchableOpacity
        style={[styles.button, value >= max && styles.buttonDisabled]}
        onPress={() => value < max && onChange(value + 1)}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel="Increase"
      >
        <Plus size={ICON_SIZE.sm} color={value >= max ? colors.disabled : colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    button: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.5 },
    value: { ...TYPE.title, color: colors.textPrimary, minWidth: 28, textAlign: 'center' },
  });
```

- [ ] **Step 2: Add `neededVolunteers` to the draft**

In `apps/mobile/src/screens/report/reportDraft.ts`, add to `ReportDraft`:

```ts
  neededVolunteers: number;
```

and to `EMPTY_DRAFT`:

```ts
  neededVolunteers: 1,
```

- [ ] **Step 3: Add the field to `DetailsStep`**

In `apps/mobile/src/screens/report/steps/DetailsStep.tsx`, add to `Props`:

```ts
  neededVolunteers: number;
  onChangeNeededVolunteers: (value: number) => void;
```

Add the imports:

```ts
import ToggleRow from '../../../components/ToggleRow';
import Stepper from '../../../components/Stepper';
```

Add this block to the JSX, after the description `TextField`:

```tsx
      <ToggleRow
        label="This needs more than one volunteer"
        value={neededVolunteers > 1}
        onValueChange={(needsTeam) => onChangeNeededVolunteers(needsTeam ? 2 : 1)}
        style={styles.field}
      />
      {neededVolunteers > 1 && (
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>Volunteers needed</Text>
          <Stepper
            value={neededVolunteers}
            min={2}
            max={20}
            onChange={onChangeNeededVolunteers}
          />
        </View>
      )}
```

Add to the styles:

```ts
    stepperRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    stepperLabel: { ...TYPE.subhead, color: colors.textPrimary },
```

- [ ] **Step 4: Wire it through `ReportFlowScreen`**

In `apps/mobile/src/screens/report/ReportFlowScreen.tsx`, add to the `DetailsStep` usage (step 1):

```tsx
            neededVolunteers={draft.neededVolunteers}
            onChangeNeededVolunteers={(neededVolunteers) => setDraft((d) => ({ ...d, neededVolunteers }))}
```

Add `neededVolunteers: draft.neededVolunteers` to the `createReport(...)` call inside `onPublish`.

- [ ] **Step 5: Type-check and reload the simulator**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors. Reload the Expo app (`xcrun simctl terminate booted host.exp.Exponent` then
`xcrun simctl openurl booted "exp://127.0.0.1:8090"`) and confirm the app still boots without a
red-screen error — this new field is on an already-shipped screen, so a regression here would be
visible immediately.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/Stepper.tsx apps/mobile/src/screens/report/
git commit -m "feat(mobile): needed-volunteers field in the report flow"
```

---

## Task 10: Mobile — Request Details screen scaffold + navigation

**Files:**
- Modify: `apps/mobile/src/navigation/types.ts`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Modify: `apps/mobile/src/screens/discover/CategoryListScreen.tsx`
- Create: `apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx`

**Interfaces:**
- Consumes: `getReport` (existing, `api/reports.ts`), `getRoster`/`acceptRequest`/
  `confirmRequest`/`leaveRequest` (Task 8).
- Produces: the `RequestDetails: { reportId: string }` route — Task 11/12 add child sections
  inside this screen's existing layout.

- [ ] **Step 1: Add the route type**

In `apps/mobile/src/navigation/types.ts`, add to `RootStackParamList`:

```ts
  RequestDetails: { reportId: string };
```

- [ ] **Step 2: Make `CategoryListScreen` rows tappable**

In `apps/mobile/src/screens/discover/CategoryListScreen.tsx`, the `ReportRow` function currently
renders a plain `<View>`. Change it to accept an `onPress` prop and wrap in `TouchableOpacity`:

Change the function signature:

```ts
function ReportRow({
  report,
  colors,
  styles,
  onPress,
}: {
  report: ReportWithDistance;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
```

Change the root `<View style={styles.row}>` to:

```tsx
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button">
```

(closing tag becomes `</TouchableOpacity>`), and add `TouchableOpacity` to the `react-native`
import.

Update the `renderItem` call site to pass navigation:

```tsx
          renderItem={({ item }) => (
            <ReportRow
              report={item}
              colors={colors}
              styles={styles}
              onPress={() => navigation.navigate('RequestDetails', { reportId: item.id })}
            />
          )}
```

`navigation` isn't currently used in this screen — add it:

```ts
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
```

```ts
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
```

(add this line inside the component, alongside the existing `useSafeAreaInsets()`/`useTheme()`
calls).

- [ ] **Step 3: Write the Request Details screen scaffold**

```tsx
// apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx
import { useMemo } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '../../theme/tokens';
import { getReport } from '../../api/reports';
import { getRoster } from '../../api/missions';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import RosterSection from './RosterSection';
import MissionChat from './MissionChat';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetails'>;

export default function RequestDetailsScreen({ route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const queryClient = useQueryClient();

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => getReport(reportId),
  });
  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ['roster', reportId],
    queryFn: () => getRoster(reportId),
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['roster', reportId] });
    }, [queryClient, reportId])
  );

  if (reportLoading || rosterLoading || !report || !roster) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primaryGreen} />
      </View>
    );
  }

  const hasAccess = report.isOwner || roster.myStatus === 'joined' || roster.myStatus === 'active';

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + SPACING.sm }}>
      <View style={styles.header}>
        <BackButton />
      </View>

      {report.photos[0] && <Image source={{ uri: report.photos[0] }} style={styles.photo} />}

      <View style={styles.content}>
        <Text style={styles.categoryLabel}>
          {report.category.emoji} {report.category.label}
        </Text>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.description}>{report.description}</Text>

        <View style={styles.locationRow}>
          <MapPin size={ICON_SIZE.sm} color={colors.textSecondary} />
          <Text style={styles.locationText}>{report.landmark || 'Location shared'}</Text>
        </View>

        {report.reporter && (
          <View style={styles.reporterRow}>
            <Avatar uri={report.reporter.avatarUrl} label={report.reporter.name} size={40} />
            <Text style={styles.reporterName}>{report.reporter.name}</Text>
          </View>
        )}

        <RosterSection reportId={reportId} report={report} roster={roster} />

        {hasAccess ? (
          <MissionChat reportId={reportId} />
        ) : (
          <View style={styles.chatLocked}>
            <Text style={styles.chatLockedText}>
              🔒 Mission Chat is available after you accept this request.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    loading: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
    header: { paddingHorizontal: SIZES.padding, marginBottom: SPACING.xs },
    photo: { width: '100%', height: 220 },
    content: { padding: SIZES.padding },
    categoryLabel: { ...TYPE.captionStrong, color: colors.textSecondary, marginBottom: SPACING.xxs },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xs },
    description: { ...TYPE.body, color: colors.textSecondary, marginBottom: SPACING.sm, lineHeight: 19 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs, marginBottom: SPACING.md },
    locationText: { ...TYPE.body, color: colors.textSecondary },
    reporterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.lg },
    reporterName: { ...TYPE.bodyStrong, color: colors.textPrimary },
    chatLocked: {
      marginTop: SPACING.lg,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chatLockedText: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
```

- [ ] **Step 4: Register the screen in `RootNavigator`**

```ts
import RequestDetailsScreen from '../screens/request-details/RequestDetailsScreen';
```

```tsx
        <Stack.Screen
          name="RequestDetails"
          component={RequestDetailsScreen}
          options={{ animation: 'slide_from_right' }}
        />
```

- [ ] **Step 5: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: errors referencing `RosterSection`/`MissionChat` not yet existing — that's expected,
Tasks 11 and 12 create them next. If any *other* error appears, fix it before moving on.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/navigation/ apps/mobile/src/screens/discover/CategoryListScreen.tsx apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx
git commit -m "feat(mobile): Request Details screen scaffold + navigation from Category List"
```

---

## Task 11: Mobile — `RosterSection` (accept / confirm / leave UI)

**Files:**
- Create: `apps/mobile/src/screens/request-details/RosterSection.tsx`

**Interfaces:**
- Consumes: `Report` (`api/reports.ts`), `Roster` (`api/missions.ts`), `acceptRequest`/
  `confirmRequest`/`leaveRequest` (Task 8), `formatTimeRemaining` (`lib/urgency.ts`, already
  built).
- Produces: `<RosterSection reportId report roster>` — used by `RequestDetailsScreen` (Task 10).

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/src/screens/request-details/RosterSection.tsx
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { acceptRequest, confirmRequest, leaveRequest, type Roster } from '../../api/missions';
import type { Report } from '../../api/reports';
import { formatTimeRemaining } from '../../lib/urgency';
import { ApiError } from '../../lib/api';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';

type Props = {
  reportId: string;
  report: Report;
  roster: Roster;
};

// docs/features/accept-and-mission-chat.md US-2/US-3/US-4 — accept, confirm
// within 15 minutes, or leave. All three mutations just refetch the roster
// (and the report, for phone-reveal changes) rather than optimistically
// guessing the new state.
export default function RosterSection({ reportId, report, roster }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roster', reportId] });
    queryClient.invalidateQueries({ queryKey: ['report', reportId] });
  };

  const onError = (e: unknown) => {
    Alert.alert('Could not complete that', e instanceof ApiError ? e.message : 'Try again.');
  };

  const acceptMutation = useMutation({ mutationFn: () => acceptRequest(reportId), onSuccess: invalidate, onError });
  const confirmMutation = useMutation({ mutationFn: () => confirmRequest(reportId), onSuccess: invalidate, onError });
  const leaveMutation = useMutation({
    mutationFn: () => leaveRequest(reportId),
    onSuccess: invalidate,
    onError,
  });

  const activeCount = roster.volunteers.filter((v) => v.status !== 'released').length;
  const isFull = activeCount >= roster.neededVolunteers;

  const onLeave = () => {
    Alert.alert('Leave this mission?', 'You will lose your volunteer slot and another volunteer can join.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveMutation.mutate() },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Volunteers</Text>
        <Text style={styles.count}>
          {activeCount} / {roster.neededVolunteers} joined
        </Text>
      </View>

      {roster.volunteers.map((v) => (
        <View key={v.id} style={[styles.row, v.status === 'released' && styles.rowReleased]}>
          <Avatar uri={v.avatarUrl} label={v.name} size={32} />
          <Text style={styles.name} numberOfLines={1}>
            {v.name}
          </Text>
          <Text style={styles.status}>
            {v.status === 'active' ? '🟢 Active' : v.status === 'joined' ? '🟡 Joined' : 'Released'}
          </Text>
        </View>
      ))}

      {roster.myStatus === null && !report.isOwner && (
        <Button
          label={isFull ? 'Volunteer limit reached' : "I'll Help"}
          onPress={() => acceptMutation.mutate()}
          disabled={isFull}
          loading={acceptMutation.isPending}
          style={styles.actionButton}
        />
      )}

      {roster.myStatus === 'joined' && (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>
            ⏱ Confirm within {roster.myConfirmDeadline ? formatTimeRemaining(roster.myConfirmDeadline) : '15m'}
          </Text>
          <Button
            label="Start Helping"
            onPress={() => confirmMutation.mutate()}
            loading={confirmMutation.isPending}
            style={styles.actionButton}
          />
          <Button
            label="Leave Mission"
            variant="ghost"
            onPress={onLeave}
            loading={leaveMutation.isPending}
          />
        </View>
      )}

      {roster.myStatus === 'active' && (
        <View style={styles.confirmBox}>
          <Text style={styles.activeText}>🟢 You're helping with this mission.</Text>
          <Button label="Leave Mission" variant="ghost" onPress={onLeave} loading={leaveMutation.isPending} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
    title: { ...TYPE.bodyStrong, color: colors.textPrimary },
    count: { ...TYPE.caption, color: colors.textSecondary },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.xxs,
    },
    rowReleased: { opacity: 0.5 },
    name: { ...TYPE.body, color: colors.textPrimary, flex: 1 },
    status: { ...TYPE.caption, color: colors.textSecondary },
    actionButton: { marginTop: SPACING.sm },
    confirmBox: { marginTop: SPACING.sm },
    confirmText: { ...TYPE.subheadStrong, color: colors.textPrimary, textAlign: 'center', marginBottom: SPACING.xs },
    activeText: { ...TYPE.subheadStrong, color: colors.primaryGreen, textAlign: 'center' },
  });
```

Note: `Button`'s `variant` prop already supports `'ghost'` (see `components/Button.tsx`, built
earlier this project) — no change needed there.

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: only the `MissionChat` import in `RequestDetailsScreen` still unresolved (Task 12) —
everything else compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/request-details/RosterSection.tsx
git commit -m "feat(mobile): roster section — accept/confirm/leave"
```

---

## Task 12: Mobile — `MissionChat`

**Files:**
- Create: `apps/mobile/src/screens/request-details/MissionChat.tsx`

**Interfaces:**
- Consumes: `listMissionMessages`/`sendMissionMessage` (Task 8).
- Produces: `<MissionChat reportId>` — used by `RequestDetailsScreen` (Task 10).

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/src/screens/request-details/MissionChat.tsx
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { listMissionMessages, sendMissionMessage, type MissionMessage } from '../../api/missions';
import TextField from '../../components/TextField';
import Button from '../../components/Button';

type Props = { reportId: string };

// docs/features/accept-and-mission-chat.md US-5/BR-4 — REST poll/refresh
// only, no realtime transport (ADR 0005). Refetches on send; the screen's
// own useFocusEffect (RequestDetailsScreen) covers refresh-on-return.
export default function MissionChat({ reportId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: messages } = useQuery({
    queryKey: ['missionMessages', reportId],
    queryFn: () => listMissionMessages(reportId),
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMissionMessage(reportId, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['missionMessages', reportId], updated);
      setDraft('');
    },
  });

  const onSend = () => {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>💬 Mission Chat</Text>

      <FlatList
        data={messages ?? []}
        keyExtractor={(m) => m.id}
        style={styles.list}
        renderItem={({ item }: { item: MissionMessage }) => (
          <View style={[styles.bubbleRow, item.isMine && styles.bubbleRowMine]}>
            <View style={[styles.bubble, item.isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {!item.isMine && <Text style={styles.senderName}>{item.senderName}</Text>}
              <Text style={item.isMine ? styles.bubbleTextMine : styles.bubbleText}>{item.body}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hello.</Text>}
      />

      <View style={styles.composerRow}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          style={styles.input}
          accessibilityLabel="Message"
        />
        <Button label="Send" onPress={onSend} loading={sendMutation.isPending} disabled={!draft.trim()} />
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: { ...TYPE.bodyStrong, color: colors.textPrimary, marginBottom: SPACING.xs },
    list: { maxHeight: 260 },
    empty: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: SPACING.md },
    bubbleRow: { flexDirection: 'row', marginBottom: SPACING.xs },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '80%', borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
    bubbleTheirs: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    bubbleMine: { backgroundColor: colors.primaryGreen },
    senderName: { ...TYPE.caption, color: colors.textSecondary, marginBottom: 2 },
    bubbleText: { ...TYPE.body, color: colors.textPrimary },
    bubbleTextMine: { ...TYPE.body, color: colors.textOnTint },
    composerRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, alignItems: 'center' },
    input: { flex: 1 },
  });
```

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile
npx tsc --noEmit
```

Expected: no errors — `RequestDetailsScreen`'s import now resolves.

- [ ] **Step 3: Reload the simulator**

```bash
xcrun simctl terminate booted host.exp.Exponent
xcrun simctl openurl booted "exp://127.0.0.1:8090"
```

Confirm no red-screen crash (screenshot the resulting screen — it'll be whatever's currently
logged in, same limitation as every prior feature: reaching `RequestDetails` itself requires
tapping through the app, which needs a human).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/request-details/MissionChat.tsx
git commit -m "feat(mobile): mission chat UI"
```

---

## Task 13: Backend automated tests for the core business logic

**Files:**
- Create: `apps/api/src/missions/missions.service.spec.ts`

**Interfaces:**
- Consumes: `MissionsService` (Task 4/6) directly — no HTTP/Supertest layer, no NestJS
  `TestingModule` ceremony needed, since `MissionsService` (like `ReportsService`) takes no
  constructor dependencies and imports `db` as a module-level singleton, exactly like the rest of
  this codebase.

This is the automated-test coverage CLAUDE.md's testing bar calls for, scoped to the logic that
actually carries risk: capacity enforcement, the lazy 15-minute expiry, and access gating. It
talks to the real dev Postgres (same one `docker compose` runs) — inserting and cleaning up its
own rows, not mocking Drizzle.

- [ ] **Step 1: Write the test file**

```ts
// apps/api/src/missions/missions.service.spec.ts
import { uuidv7 } from 'uuidv7';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportStatuses, reports } from '../db/schema/reports-schema';
import { missionVolunteers, missions } from '../db/schema/missions-schema';
import { MissionsService } from './missions.service';

describe('MissionsService', () => {
  const service = new MissionsService();
  let reporterId: string;
  let volunteerAId: string;
  let volunteerBId: string;
  let categoryId: string;
  let openStatusId: string;
  let reportId: string;

  beforeAll(async () => {
    reporterId = uuidv7();
    volunteerAId = uuidv7();
    volunteerBId = uuidv7();

    await db.insert(user).values([
      { id: reporterId, name: 'Test Reporter', email: `${reporterId}@test.local`, phoneNumber: `+91${reporterId.slice(0, 10)}` },
      { id: volunteerAId, name: 'Volunteer A', email: `${volunteerAId}@test.local`, phoneNumber: `+91${volunteerAId.slice(0, 10)}` },
      { id: volunteerBId, name: 'Volunteer B', email: `${volunteerBId}@test.local`, phoneNumber: `+91${volunteerBId.slice(0, 10)}` },
    ]);

    const [category] = await db.select().from(reportCategories).where(eq(reportCategories.key, 'medicalHelp'));
    const [openStatus] = await db.select().from(reportStatuses).where(eq(reportStatuses.key, 'open'));
    categoryId = category.id;
    openStatusId = openStatus.id;
  });

  afterAll(async () => {
    // Cascades to missions/mission_volunteers/mission_messages via onDelete: 'cascade'.
    await db.delete(reports).where(eq(reports.reporterId, reporterId));
    await db.delete(user).where(eq(user.id, reporterId));
    await db.delete(user).where(eq(user.id, volunteerAId));
    await db.delete(user).where(eq(user.id, volunteerBId));
  });

  beforeEach(async () => {
    reportId = uuidv7();
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      categoryId,
      statusId: openStatusId,
      title: 'Test report',
      description: 'Test',
      lat: 13.08,
      lng: 80.27,
      neededVolunteers: 1,
      expiryAt: new Date(Date.now() + 60 * 60_000),
    });
  });

  it('rejects a reporter accepting their own report', async () => {
    await expect(service.accept(reportId, reporterId)).rejects.toThrow('You cannot accept your own report');
  });

  it('lets a volunteer accept, then rejects a second acceptance once the cap is reached', async () => {
    const roster = await service.accept(reportId, volunteerAId);
    expect(roster.myStatus).toBe('joined');
    expect(roster.volunteers).toHaveLength(1);

    await expect(service.accept(reportId, volunteerBId)).rejects.toThrow('Volunteer limit reached');
  });

  it('rejects a duplicate accept from the same volunteer', async () => {
    await service.accept(reportId, volunteerAId);
    await expect(service.accept(reportId, volunteerAId)).rejects.toThrow('You already accepted');
  });

  it('confirm moves joined -> active', async () => {
    await service.accept(reportId, volunteerAId);
    const roster = await service.confirm(reportId, volunteerAId);
    expect(roster.myStatus).toBe('active');
  });

  it('leave releases the slot so another volunteer can join', async () => {
    await db.update(reports).set({ neededVolunteers: 1 }).where(eq(reports.id, reportId));
    await service.accept(reportId, volunteerAId);
    await service.leave(reportId, volunteerAId);

    const roster = await service.getRoster(reportId, volunteerBId);
    expect(roster.volunteers[0].status).toBe('released');

    const secondAccept = await service.accept(reportId, volunteerBId);
    expect(secondAccept.myStatus).toBe('joined');
  });

  it('lazily releases a stale joined row once its deadline has passed', async () => {
    await service.accept(reportId, volunteerAId);

    // Force the deadline into the past directly, simulating 15+ minutes elapsed.
    const [mission] = await db.select().from(missions).where(eq(missions.reportId, reportId));
    await db
      .update(missionVolunteers)
      .set({ confirmDeadline: new Date(Date.now() - 60_000) })
      .where(eq(missionVolunteers.missionId, mission.id));

    const roster = await service.getRoster(reportId, volunteerAId);
    expect(roster.myStatus).toBe('released');

    // The slot is free again — a second volunteer can now accept.
    const secondAccept = await service.accept(reportId, volunteerBId);
    expect(secondAccept.myStatus).toBe('joined');
  });

  it('denies chat access to a user who never accepted', async () => {
    await expect(service.listMessages(reportId, volunteerBId)).rejects.toThrow(
      'You need to accept this request'
    );
  });

  it('allows chat for the reporter and an active volunteer, and reflects it after leaving', async () => {
    await service.accept(reportId, volunteerAId);
    await service.confirm(reportId, volunteerAId);

    await service.sendMessage(reportId, volunteerAId, 'On my way');
    const asReporter = await service.listMessages(reportId, reporterId);
    expect(asReporter).toHaveLength(1);
    expect(asReporter[0].body).toBe('On my way');
    expect(asReporter[0].isMine).toBe(false);

    await service.leave(reportId, volunteerAId);
    await expect(service.sendMessage(reportId, volunteerAId, 'still there?')).rejects.toThrow(
      'You need to accept this request'
    );
  });
});
```

- [ ] **Step 2: Run it and verify it fails first (TDD sanity check)**

If this is being executed against Task 4-6's already-written service, skip straight to Step 3 — the
service exists already. If instead this task runs *before* Tasks 4-6 exist yet (an executor
following strict TDD), run:

```bash
cd apps/api
pnpm test missions.service.spec.ts
```

Expected: FAIL — `missions.service.ts` doesn't exist yet.

- [ ] **Step 3: Run it against the real implementation**

```bash
cd apps/api
pnpm test missions.service.spec.ts
```

Expected: all 8 tests pass. If `user.insert(...)` fails on a unique constraint (phone/email
collision with a leftover row from a previous failed run), manually clean up first:

```bash
docker exec uthavu-postgres psql -U uthavu -d uthavu_dev -c "delete from \"user\" where email like '%@test.local';"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/missions/missions.service.spec.ts
git commit -m "test(api): MissionsService — capacity, lazy expiry, and access gating"
```

---

## Task 14: Final sync pass

**Files:**
- Modify: `docs/features/accept-and-mission-chat.md` (only if implementation diverged from spec)

- [ ] **Step 1: Diff implementation against the spec**

Re-read `docs/features/accept-and-mission-chat.md` end to end against what was actually built.
Common drift points to check specifically: did any endpoint path change from what's implied?
Did `neededVolunteers`'s bounds stay 1–20? Did the lazy-expiry approach stay lazy (no job got
added along the way)? Did moderation/completion stay out of scope?

- [ ] **Step 2: Update the spec doc if anything drifted, otherwise leave it as-is**

If nothing drifted, this step is a no-op — don't edit the doc just to touch it.

- [ ] **Step 3: Full rebuild + typecheck sweep**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ..
cd apps/mobile && npx tsc --noEmit && cd ..
docker compose up -d --build api
```

Expected: both clean, container healthy (`docker compose ps` shows `uthavu-api` `Up`).

- [ ] **Step 4: Commit (only if Step 2 changed the doc)**

```bash
git add docs/features/accept-and-mission-chat.md
git commit -m "docs: sync accept-and-mission-chat spec with implementation"
```
