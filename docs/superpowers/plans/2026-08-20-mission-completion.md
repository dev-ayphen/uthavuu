# Mission Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an active volunteer submit a completion photo + note for a mission, verify the
submission is genuine (without fabricating an ML content check), close the report, and lock
Mission Chat to read-only.

**Architecture:** Extends the existing `missions` domain (same `MissionsService`/`MissionsController`
built for `accept-and-mission-chat.md`) with one new table (`mission_completions`) and one new
lookup table (`mission_completion_statuses`). Verification is a real, synchronous, in-process check
— no queue, no ML — that the submitted photo URL corresponds to a file actually uploaded through
this app's own `/uploads` endpoint.

**Tech Stack:** NestJS + Drizzle + PostgreSQL (Docker), nestjs-zod DTOs, Expo/React Native +
`@uthavu/libs-mobile` workspace package, `@tanstack/react-query`.

**Spec:** [`docs/features/mission-completion.md`](../../features/mission-completion.md)

## Global Constraints

- UUIDv7 primary keys via the `uuidv7` npm package at insert time (Postgres 16 has no native
  `uuidv7()`). `timestamp with timezone` on every new column.
- Status/enum values live in lookup tables referenced by FK, never hardcoded text enums
  (CLAUDE.md § Database) — this is why `mission_completion_statuses` exists even though today's
  verification always resolves to `verified` synchronously.
- Migrations only, via `pnpm db:generate` then `pnpm db:migrate` against the real dev Postgres
  (docker compose, host port 5433). `db:push` is banned — there is no such script.
- The API runs in Docker: `docker compose up -d --build api` after every backend code change,
  then curl-verify against `http://localhost:3001`.
- Mobile: zero raw hex colors or magic-number spacing/sizing — everything from
  `@uthavu/libs-mobile/theme/tokens`. Shared code lives in `@uthavu/libs-mobile`, imported via
  `@uthavu/libs-mobile/<dir>/<file>` subpath imports, not relative paths into `libs-mobile`.
- No giant files — the completion composer is its own component file, not inlined into
  `RosterSection.tsx` or `RequestDetailsScreen.tsx`.
- Backend tests in this project use **no NestJS `TestingModule`** — instantiate services directly
  (e.g. `new MissionsService(new AlertsService())`), hit the real dev Postgres, clean up fixtures
  in `afterAll`, `import 'dotenv/config'` at the top, run via `pnpm test <file> --forceExit`.
  Tests are written **after** the curl-verified implementation, as a dedicated task — matching
  this project's own established practice for `accept-and-mission-chat.md`, not strict red-green
  TDD per method.
- Out of scope (do not build any of this — see the spec's own Out of scope section): Impact Story
  generation/sharing, any reputation/credit/badge system, real ML-based content verification,
  human/reporter-review-based verification, editing/retracting a completion.

---

### Task 1: Schema — `mission_completion_statuses`, `mission_completions`, `completed` report status

**Files:**
- Modify: `apps/api/src/db/schema/missions-schema.ts`
- Modify: `apps/api/src/db/seed.ts`
- Create: `apps/api/drizzle/0006_*.sql` (generated, not hand-written)

**Interfaces:**
- Produces: `missionCompletionStatuses` table (`id`, `key`, `label`, `createdAt`, `updatedAt`),
  `missionCompletions` table (`id`, `missionId` unique FK → `missions`, `completedById` FK →
  `user`, `photoUrl`, `note`, `statusId` FK → `missionCompletionStatuses`, `submittedAt`,
  `verifiedAt` nullable), both exported from `missions-schema.ts`. A new `report_statuses` row
  with `key='completed'`.

- [ ] **Step 1: Add the two new tables + relations to `missions-schema.ts`**

Open `apps/api/src/db/schema/missions-schema.ts`. After the existing `missionMessageRelations`
export at the end of the file, add:

```ts
export const missionCompletionStatuses = pgTable('mission_completion_statuses', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// docs/features/mission-completion.md BR-4: modeled as a real, distinct,
// timestamped state even though today's verification is synchronous and
// always resolves to 'verified' within the same request — so a future
// pass can make verification genuinely asynchronous without a redesign.
export const missionCompletions = pgTable('mission_completions', {
  id: uuid('id').primaryKey(),
  missionId: uuid('mission_id')
    .notNull()
    .unique()
    .references(() => missions.id, { onDelete: 'cascade' }),
  completedById: text('completed_by_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  photoUrl: text('photo_url').notNull(),
  note: text('note').notNull(),
  statusId: uuid('status_id')
    .notNull()
    .references(() => missionCompletionStatuses.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
});

export const missionCompletionRelations = relations(missionCompletions, ({ one }) => ({
  mission: one(missions, { fields: [missionCompletions.missionId], references: [missions.id] }),
  completedBy: one(user, { fields: [missionCompletions.completedById], references: [user.id] }),
  status: one(missionCompletionStatuses, {
    fields: [missionCompletions.statusId],
    references: [missionCompletionStatuses.id],
  }),
}));
```

Also add a `completion: one(missionCompletions, ...)` entry to the existing `missionRelations`
export (find it near the top-middle of the file) so it reads:

```ts
export const missionRelations = relations(missions, ({ one, many }) => ({
  report: one(reports, { fields: [missions.reportId], references: [reports.id] }),
  volunteers: many(missionVolunteers),
  messages: many(missionMessages),
  completion: one(missionCompletions, { fields: [missions.id], references: [missionCompletions.missionId] }),
}));
```

- [ ] **Step 2: Add the `completed` report status and `mission_completion_statuses` seed rows**

Open `apps/api/src/db/seed.ts`. Add `missionCompletionStatuses` to the schema import:

```ts
import { missionCompletionStatuses, missionVolunteerStatuses } from './schema/missions-schema';
```

Add `'completed'` to the existing `STATUSES` array:

```ts
const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'expired', label: 'Expired' },
  { key: 'completed', label: 'Completed' },
] as const;
```

Add a new array right after `MISSION_VOLUNTEER_STATUSES`:

```ts
// mission-completion.md — a mission's own completion state, distinct from
// mission_volunteers.status (each volunteer's participation) and from
// report_statuses (the report's own lifecycle).
const MISSION_COMPLETION_STATUSES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'waiting_verification', label: 'Waiting Verification' },
  { key: 'verified', label: 'Verified' },
] as const;
```

Add the matching upsert loop right after the existing `MISSION_VOLUNTEER_STATUSES` loop, before
the `console.log`:

```ts
  for (const status of MISSION_COMPLETION_STATUSES) {
    await db
      .insert(missionCompletionStatuses)
      .values({ id: uuidv7(), ...status })
      .onConflictDoUpdate({
        target: missionCompletionStatuses.key,
        set: { label: status.label, updatedAt: sql`now()` },
      });
  }
```

Update the final `console.log` to also report the new count:

```ts
  console.log(
    `Seeded ${CATEGORIES.length} report categories, ${STATUSES.length} report statuses, ${MISSION_VOLUNTEER_STATUSES.length} mission volunteer statuses, and ${MISSION_COMPLETION_STATUSES.length} mission completion statuses.`
  );
```

- [ ] **Step 3: Generate and run the migration**

Run: `pnpm --filter api db:generate`
Expected: a new `apps/api/drizzle/0006_*.sql` file listing the two new tables and confirms
`16 tables` → `18 tables` in the CLI output (16 existing + `mission_completion_statuses` +
`mission_completions`).

Run: `pnpm --filter api db:migrate`
Expected: `[✓] migrations applied successfully!`

- [ ] **Step 4: Seed and verify**

Run: `docker compose up -d --build api` (picks up the schema/seed changes), then check the seed
ran (the API's Docker entrypoint runs migrate+seed on boot — confirm via
`docker compose logs api --tail 20` shows the updated seed count line).

If the container doesn't auto-seed, run seeding manually: `pnpm --filter api exec tsx src/db/seed.ts`
(check `apps/api/package.json`'s `db:seed` script for the exact command actually configured, and
use that instead if it differs).

Verify directly:
```bash
docker compose exec -T postgres psql -U uthavu -d uthavu_dev -c "SELECT key, label FROM mission_completion_statuses ORDER BY key;"
docker compose exec -T postgres psql -U uthavu -d uthavu_dev -c "SELECT key, label FROM report_statuses ORDER BY key;"
```
Expected: 3 rows (`submitted`, `verified`, `waiting_verification`) in the first query; 4 rows
(`closed`, `completed`, `expired`, `open`) in the second.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema/missions-schema.ts apps/api/src/db/seed.ts apps/api/drizzle
git commit -m "feat: mission_completions schema + completed report status"
```

---

### Task 2: Backend service logic — verification + `complete()` + Mission Chat lock

**Files:**
- Modify: `apps/api/src/missions/missions.service.ts`
- Create: `apps/api/src/missions/dto/complete-mission.dto.ts`

**Interfaces:**
- Consumes: `missionCompletions`, `missionCompletionStatuses` from Task 1. `UPLOADS_DIR` exported
  from `apps/api/src/uploads/multer.config.ts` (already exists, unchanged).
- Produces: `MissionsService.complete(reportId: string, volunteerId: string, photoUrl: string, note: string): Promise<RosterResponse>`
  — reuses the existing `RosterResponse` type already defined at the top of `missions.service.ts`.
  `MissionsService.sendMessage()` gains a rejection path when the report is `completed` (same
  signature as today, `Promise<MissionMessage[]>`-shaped return unchanged).

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/missions/dto/complete-mission.dto.ts`:

```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CompleteMissionSchema = z.object({
  photoUrl: z.string().trim().url(),
  note: z.string().trim().min(1, 'A completion note is required').max(1000),
});

export class CompleteMissionDto extends createZodDto(CompleteMissionSchema) {}
```

- [ ] **Step 2: Add imports and the verification helper to `missions.service.ts`**

Open `apps/api/src/missions/missions.service.ts`. Update the top imports:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { desc, eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../db';
import { user } from '../db/schema/auth-schema';
import { reportCategories, reportPhotos, reportStatuses, reports } from '../db/schema/reports-schema';
import {
  missionCompletions,
  missionCompletionStatuses,
  missionMessages,
  missionVolunteerStatuses,
  missionVolunteers,
  missions,
} from '../db/schema/missions-schema';
import { AlertsService } from '../alerts/alerts.service';
import { UPLOADS_DIR } from '../uploads/multer.config';
```

Add a new private helper right after `getVolunteerStatusIdByKey` (which already exists):

```ts
  private async getReportStatusIdByKey(key: 'open' | 'closed' | 'expired' | 'completed'): Promise<string> {
    const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.key, key));
    if (!status) throw new Error(`report_statuses row missing for key "${key}" — did db:seed run?`);
    return status.id;
  }

  private async getCompletionStatusIdByKey(
    key: 'submitted' | 'waiting_verification' | 'verified'
  ): Promise<string> {
    const [status] = await db
      .select()
      .from(missionCompletionStatuses)
      .where(eq(missionCompletionStatuses.key, key));
    if (!status) throw new Error(`mission_completion_statuses row missing for key "${key}" — did db:seed run?`);
    return status.id;
  }

  // BR-3: real verification, not fabricated ML content analysis — confirms
  // the submitted photo actually came from this app's own upload store
  // (matches the URL shape POST /uploads returns, and the file genuinely
  // exists on disk) rather than trusting an arbitrary client-supplied URL.
  private isGenuineUpload(photoUrl: string): boolean {
    const prefix = `${process.env.BETTER_AUTH_URL}/uploads/`;
    if (!photoUrl.startsWith(prefix)) return false;
    const filename = photoUrl.slice(prefix.length);
    if (!filename || filename.includes('/') || filename.includes('..')) return false;
    return existsSync(join(UPLOADS_DIR, filename));
  }
```

- [ ] **Step 3: Add `complete()`**

Add this method after `leave()` (keeps the mutation methods — accept/confirm/leave/complete —
grouped together):

```ts
  // docs/features/mission-completion.md US-1/US-2/BR-1..BR-6.
  async complete(reportId: string, volunteerId: string, photoUrl: string, note: string): Promise<RosterResponse> {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!report) throw new NotFoundException('Report not found');
    if (report.reporterId === volunteerId) {
      throw new BadRequestException('You cannot complete your own report');
    }

    const missionId = await this.requireMissionId(reportId);
    const rows = await this.expireStaleAndListVolunteers(missionId);
    const mine = rows.find((r) => r.mv.volunteerId === volunteerId);
    if (!mine || mine.status.key !== 'active') {
      throw new BadRequestException('You must be an active volunteer on this mission to complete it');
    }

    const [existingCompletion] = await db
      .select()
      .from(missionCompletions)
      .where(eq(missionCompletions.missionId, missionId));
    if (existingCompletion) {
      throw new BadRequestException('This mission has already been completed');
    }

    if (!this.isGenuineUpload(photoUrl)) {
      throw new BadRequestException('The completion photo must be one uploaded through this app');
    }

    const verifiedStatusId = await this.getCompletionStatusIdByKey('verified');
    const completedReportStatusId = await this.getReportStatusIdByKey('completed');
    const now = new Date();

    await db.insert(missionCompletions).values({
      id: uuidv7(),
      missionId,
      completedById: volunteerId,
      photoUrl,
      note,
      statusId: verifiedStatusId,
      submittedAt: now,
      verifiedAt: now,
    });

    await db
      .update(reports)
      .set({ statusId: completedReportStatusId, closedAt: now })
      .where(eq(reports.id, reportId));

    const [volunteer] = await db.select().from(user).where(eq(user.id, volunteerId));
    await this.alertsService.create(
      report.reporterId,
      'mission_completed',
      'Mission Completed',
      `${volunteer?.name ?? 'A volunteer'} marked "${report.title}" as complete.`,
      reportId
    );

    return this.getRoster(reportId, volunteerId);
  }
```

- [ ] **Step 4: Gate `sendMessage()` on report completion**

Replace the existing `sendMessage()` method:

```ts
  async sendMessage(reportId: string, senderId: string, body: string) {
    if (!(await this.hasActiveAccess(reportId, senderId))) {
      throw new ForbiddenException('You need to accept this request to post in Mission Chat');
    }

    const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (report) {
      const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.id, report.statusId));
      if (status?.key === 'completed') {
        throw new ForbiddenException('This mission is complete — Mission Chat is read-only');
      }
    }

    const missionId = await this.requireMissionId(reportId);
    await db.insert(missionMessages).values({ id: uuidv7(), missionId, senderId, body });
    return this.listMessages(reportId, senderId);
  }
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/missions/missions.service.ts apps/api/src/missions/dto/complete-mission.dto.ts
git commit -m "feat: mission completion service logic + Mission Chat lock on complete"
```

---

### Task 3: Backend controller + curl verification

**Files:**
- Modify: `apps/api/src/missions/missions.controller.ts`

**Interfaces:**
- Consumes: `MissionsService.complete()` from Task 2, `CompleteMissionDto` from Task 2.
- Produces: `POST /reports/:id/complete` route.

- [ ] **Step 1: Add the route**

Open `apps/api/src/missions/missions.controller.ts`. Add the import:

```ts
import { CompleteMissionDto } from './dto/complete-mission.dto';
```

Add the new endpoint after `leave` (find the existing `@Delete('volunteers/me') leave(...)` method):

```ts
  @Post('complete')
  complete(
    @Session() session: UserSession<typeof auth>,
    @Param('id') id: string,
    @Body() body: CompleteMissionDto
  ) {
    return this.missionsService.complete(id, session.user.id, body.photoUrl, body.note);
  }
```

- [ ] **Step 2: Rebuild and boot the API**

Run: `docker compose up -d --build api`
Expected: build succeeds, `docker compose logs api --tail 10` shows
`Mapped {/reports/:id/complete, POST} route` and `Nest application successfully started`.

- [ ] **Step 3: Curl-verify the full flow end to end**

Create two test users (reporter + volunteer), a report, accept + confirm, upload a photo, then
complete — following the exact OTP dev-fallback pattern already used earlier this session (request
OTP, read the code from `docker compose logs api --tail 30` via `Code:\s+[0-9]{6}`, verify, use the
returned bearer token). After setting up `REPORTER_TOKEN`, `VOLUNTEER_TOKEN`, and a `REPORT_ID`
(reuse the exact sequence from this session's own alerts/comments verification — profile completion,
category fetch, report creation with a placeholder `photoUrls` entry), run:

```bash
# Volunteer accepts, then confirms (must be 'active', not just 'joined', to complete — BR-1)
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/volunteers -H "Authorization: Bearer $VOLUNTEER_TOKEN"
curl -s -X PATCH http://localhost:3001/reports/$REPORT_ID/volunteers/me -H "Authorization: Bearer $VOLUNTEER_TOKEN"

# Negative: still-'joined' can't complete — skip confirm and try complete first in a throwaway
# second test report if you want to verify this specific rejection path.

# Negative: reporter cannot complete their own report
curl -s -o /dev/null -w "reporter completes own report -> %{http_code}\n" -X POST http://localhost:3001/reports/$REPORT_ID/complete \
  -H "Authorization: Bearer $REPORTER_TOKEN" -H "Content-Type: application/json" \
  -d '{"photoUrl":"http://localhost:3001/uploads/does-not-exist.jpg","note":"done"}'
# Expected: 400

# Negative: a photoUrl that was never actually uploaded is rejected (BR-3)
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/complete \
  -H "Authorization: Bearer $VOLUNTEER_TOKEN" -H "Content-Type: application/json" \
  -d '{"photoUrl":"http://localhost:3001/uploads/fake-nonexistent-file.jpg","note":"Delivered the food packets."}'
# Expected: 400 "The completion photo must be one uploaded through this app"

# Real upload, then complete
curl -s -X POST http://localhost:3001/uploads -H "Authorization: Bearer $VOLUNTEER_TOKEN" \
  -F "file=@/path/to/any/local/test.jpg;type=image/jpeg"
# copy the returned "url" value into PHOTO_URL

curl -s -X POST http://localhost:3001/reports/$REPORT_ID/complete \
  -H "Authorization: Bearer $VOLUNTEER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"photoUrl\":\"$PHOTO_URL\",\"note\":\"Delivered the food packets to the shelter.\"}"
# Expected: 200, roster response

# Confirm the report is now 'completed'
curl -s http://localhost:3001/reports/$REPORT_ID -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: "status":"completed", "closedAt" is set

# Idempotency: completing again is rejected
curl -s -o /dev/null -w "double-complete -> %{http_code}\n" -X POST http://localhost:3001/reports/$REPORT_ID/complete \
  -H "Authorization: Bearer $VOLUNTEER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"photoUrl\":\"$PHOTO_URL\",\"note\":\"again\"}"
# Expected: 400

# Mission Chat: sending after completion is rejected, reading still works
curl -s -o /dev/null -w "send after complete -> %{http_code}\n" -X POST http://localhost:3001/reports/$REPORT_ID/messages \
  -H "Authorization: Bearer $VOLUNTEER_TOKEN" -H "Content-Type: application/json" -d '{"body":"hello"}'
# Expected: 403

curl -s -o /dev/null -w "read after complete -> %{http_code}\n" http://localhost:3001/reports/$REPORT_ID/messages \
  -H "Authorization: Bearer $VOLUNTEER_TOKEN"
# Expected: 200
```

If any negative case doesn't return the expected status, fix the service logic before moving on —
don't proceed to Task 4 with a curl case that doesn't match its expected result.

- [ ] **Step 4: Clean up test fixtures**

```bash
docker compose exec -T postgres psql -U uthavu -d uthavu_dev -c "DELETE FROM \"user\" WHERE name IN ('Test Reporter', 'Test Volunteer');"
```
(Adjust the names to whatever you actually used — cascades remove the report/mission/completion.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/missions/missions.controller.ts
git commit -m "feat: POST /reports/:id/complete endpoint"
```

---

### Task 4: Backend Jest tests

**Files:**
- Modify: `apps/api/src/missions/missions.service.spec.ts`

**Interfaces:**
- Consumes: `MissionsService.complete()`, `MissionsService.sendMessage()` from Task 2/3.

- [ ] **Step 1: Add test cases**

Open `apps/api/src/missions/missions.service.spec.ts`. Following its existing fixture-setup
pattern exactly (real Postgres, `uuidv7()` for unique phone numbers — never a sliced substring,
see this file's own history), add a new `describe('complete()', ...)` block covering:

```ts
describe('complete()', () => {
  it('rejects a volunteer who is only joined, not active', async () => {
    // accept as volunteerA, do NOT confirm, then:
    await expect(
      service.complete(reportId, volunteerAId, 'http://example.com/fake.jpg', 'done')
    ).rejects.toThrow('You must be an active volunteer');
  });

  it('rejects the reporter completing their own report', async () => {
    await expect(
      service.complete(reportId, reporterId, 'http://example.com/fake.jpg', 'done')
    ).rejects.toThrow('cannot complete your own report');
  });

  it('rejects a photoUrl that was never actually uploaded', async () => {
    // accept + confirm as volunteerA first, then:
    await expect(
      service.complete(reportId, volunteerAId, `${process.env.BETTER_AUTH_URL}/uploads/nonexistent.jpg`, 'done')
    ).rejects.toThrow('must be one uploaded through this app');
  });

  it('rejects completing an already-completed mission', async () => {
    // after a successful complete() call in an earlier test in this block,
    // or by writing an uploaded fixture file directly to UPLOADS_DIR for a
    // real complete() call first, then calling complete() again:
    await expect(
      service.complete(reportId, volunteerAId, realUploadedPhotoUrl, 'again')
    ).rejects.toThrow('already been completed');
  });
});

describe('sendMessage() after completion', () => {
  it('rejects sending once the report is completed', async () => {
    await expect(service.sendMessage(reportId, volunteerAId, 'hello')).rejects.toThrow('read-only');
  });

  it('still allows reading messages after completion', async () => {
    await expect(service.listMessages(reportId, volunteerAId)).resolves.toEqual(expect.any(Array));
  });
});
```

Write the actual fixture setup these tests need (a real uploaded file on disk under `UPLOADS_DIR`
for the "real upload" cases — write a small buffer directly to
`path.join(UPLOADS_DIR, 'test-completion-photo.jpg')` in a `beforeAll`/`beforeEach` and clean it up
in `afterAll`, then build the URL as `` `${process.env.BETTER_AUTH_URL}/uploads/test-completion-photo.jpg` ``
— don't go through the HTTP `/uploads` endpoint from a service-level test, write the file directly
since `isGenuineUpload()` only checks disk existence + URL shape).

- [ ] **Step 2: Run the tests**

Run: `cd apps/api && npx jest missions.service.spec.ts --forceExit`
Expected: all tests pass, including the pre-existing ones (don't regress `accept`/`confirm`/`leave`
tests).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/missions/missions.service.spec.ts
git commit -m "test: mission completion service coverage"
```

---

### Task 5: Mobile API client + `Report` type

**Files:**
- Modify: `libs-mobile/api/missions.ts`
- Modify: `libs-mobile/api/reports.ts`

**Interfaces:**
- Produces: `completeMission(reportId: string, photoUrl: string, note: string): Promise<Roster>`
  (reuses the existing `Roster` type already exported from `libs-mobile/api/missions.ts`).
  `Report['status']` widens to include `'completed'`.

- [ ] **Step 1: Add `completeMission` to `libs-mobile/api/missions.ts`**

Add after the existing `leaveRequest` function:

```ts
export function completeMission(reportId: string, photoUrl: string, note: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/complete`, {
    method: 'POST',
    auth: true,
    body: { photoUrl, note },
  });
}
```

- [ ] **Step 2: Widen the `Report` status type**

Open `libs-mobile/api/reports.ts`. Change:

```ts
  status: 'open' | 'closed' | 'expired';
```
to:
```ts
  status: 'open' | 'closed' | 'expired' | 'completed';
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (this will surface every place in mobile code that narrows on `report.status`
without handling `'completed'` — if any switch/if-chain becomes non-exhaustive, note it for the
later mobile tasks but don't fix unrelated screens here, only what those tasks own).

- [ ] **Step 4: Commit**

```bash
git add libs-mobile/api/missions.ts libs-mobile/api/reports.ts
git commit -m "feat: completeMission API client + widen Report.status"
```

---

### Task 6: Mobile — completion composer component

**Files:**
- Create: `apps/mobile/src/screens/request-details/CompleteMissionSheet.tsx`

**Interfaces:**
- Consumes: `completeMission` from Task 5, `uploadImage` from `@uthavu/libs-mobile/api/users`
  (already exists, used by `ProfileSetupScreen.tsx` — same function, no changes needed).
- Produces: `<CompleteMissionSheet reportId={string} onComplete={() => void} onClose={() => void} />`
  — a modal/sheet component. `onComplete` is called after a successful submission so the parent
  (Task 7) can invalidate its queries and close the sheet.

- [ ] **Step 1: Write the component**

Camera-only capture (no gallery option — spec US-1 AC1), a required note field, submit button.
Follow `ProfileSetupScreen.tsx`'s `launchPicker`/photo-upload pattern but skip its action-sheet
(there's only one source here):

```tsx
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { completeMission } from '@uthavu/libs-mobile/api/missions';
import { uploadImage } from '@uthavu/libs-mobile/api/users';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Button from '@uthavu/libs-mobile/components/Button';
import TextField from '@uthavu/libs-mobile/components/TextField';

type Props = {
  visible: boolean;
  reportId: string;
  onComplete: () => void;
  onClose: () => void;
};

// docs/features/mission-completion.md US-1 — camera-only capture (no
// gallery picker), a required note, then a single submit call. No
// "verification pending" UI state: BR-4/US-2 AC3 — today's verification
// resolves synchronously, the caller finds out success/failure immediately.
export default function CompleteMissionSheet({ visible, reportId, onComplete, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onTakePhoto = async () => {
    setPhotoError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setPhotoError('Camera access is needed to submit a completion photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setLocalPhotoUri(uri);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadImage(uri);
      setPhotoUrl(uploaded.url);
    } catch {
      setPhotoError('Could not upload the photo. Tap to try again.');
      setPhotoUrl(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const isValid = !!photoUrl && note.trim().length > 0;

  const onSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await completeMission(reportId, photoUrl!, note.trim());
      onComplete();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not submit completion. Try again.';
      setError(message);
      Alert.alert('Not completed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Complete Mission</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <X size={ICON_SIZE.md} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.photoBox}
            onPress={onTakePhoto}
            disabled={uploadingPhoto}
            accessibilityRole="button"
            accessibilityLabel={photoUrl ? 'Retake completion photo' : 'Take completion photo'}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={colors.primaryGreen} />
            ) : localPhotoUri ? (
              <Text style={styles.photoBoxText}>Photo captured — tap to retake</Text>
            ) : (
              <>
                <Camera size={ICON_SIZE.lg} color={colors.primaryGreen} />
                <Text style={styles.photoBoxText}>Take a photo</Text>
              </>
            )}
          </TouchableOpacity>
          {photoError ? <Text style={styles.error}>{photoError}</Text> : null}

          <TextField
            value={note}
            onChangeText={setNote}
            placeholder="What did you do? (required)"
            multiline
            accessibilityLabel="Completion note"
            style={styles.noteField}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label="Submit" onPress={onSubmit} disabled={!isValid} loading={submitting} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.pill,
      borderTopRightRadius: RADIUS.pill,
      padding: SIZES.padding,
      paddingBottom: SPACING.xxxl,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
    title: { ...TYPE.screenTitle, color: colors.textPrimary },
    photoBox: {
      height: 140,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    photoBoxText: { ...TYPE.subhead, color: colors.textSecondary },
    noteField: { marginBottom: SPACING.sm, minHeight: 80 },
    error: { ...TYPE.body, color: colors.danger, marginBottom: SPACING.xs, textAlign: 'center' },
  });
```

Check `TextField`'s props in `libs-mobile/components/TextField.tsx` for whether it already accepts
a `multiline` prop — if it doesn't, either add one (small, additive change to `TextField.tsx`,
following its existing prop pattern) or use a raw `TextInput` styled to match `TextField`'s
existing visual style for this one field. Prefer extending `TextField` if the change is small;
don't fork a one-off multiline text input style if avoidable.

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/request-details/CompleteMissionSheet.tsx libs-mobile/components/TextField.tsx
git commit -m "feat: CompleteMissionSheet composer (camera + note + submit)"
```

---

### Task 7: Mobile — wire "Complete Mission" into RosterSection

**Files:**
- Modify: `apps/mobile/src/screens/request-details/RosterSection.tsx`

**Interfaces:**
- Consumes: `CompleteMissionSheet` from Task 6.

- [ ] **Step 1: Add the action and sheet state**

Open `apps/mobile/src/screens/request-details/RosterSection.tsx`. Import the new component:

```ts
import CompleteMissionSheet from './CompleteMissionSheet';
```

Add sheet-visibility state near the top of the component body (alongside the existing
mutation hooks):

```ts
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);
```

(Add `useState` to the existing `react` import if not already there — check the current import
line first.)

In the `roster.myStatus === 'active'` block (the one currently rendering "🟢 You're helping with
this mission." + the "Leave Mission" button), add a "Complete Mission" button above "Leave
Mission":

```tsx
      {roster.myStatus === 'active' && (
        <View style={styles.confirmBox}>
          <Text style={styles.activeText}>🟢 You're helping with this mission.</Text>
          <Button label="Complete Mission" onPress={() => setCompleteSheetOpen(true)} style={styles.actionButton} />
          <Button label="Leave Mission" variant="ghost" onPress={onLeave} loading={leaveMutation.isPending} />
        </View>
      )}
```

At the end of the component's returned JSX (as a sibling to the outer `<View style={styles.container}>`,
so it can render as a modal overlay), add:

```tsx
      <CompleteMissionSheet
        visible={completeSheetOpen}
        reportId={reportId}
        onClose={() => setCompleteSheetOpen(false)}
        onComplete={() => {
          setCompleteSheetOpen(false);
          invalidate();
        }}
      />
```

(`invalidate` already exists in this file — it's the same function `acceptMutation`/
`confirmMutation`/`leaveMutation` call on success, invalidating `['roster', reportId]` and
`['report', reportId]`. Reuse it exactly, don't write a new invalidation call.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/request-details/RosterSection.tsx
git commit -m "feat: Complete Mission action on the roster for active volunteers"
```

---

### Task 8: Mobile — Mission Chat lock + completion display on Request Details

**Files:**
- Modify: `apps/mobile/src/screens/request-details/MissionChat.tsx`
- Modify: `apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx`

**Interfaces:**
- Consumes: `Report['status']` (now includes `'completed'`, from Task 5).

- [ ] **Step 1: Make `MissionChat` accept a `locked` prop**

Open `apps/mobile/src/screens/request-details/MissionChat.tsx`. Change the `Props` type and the
component signature:

```ts
type Props = { reportId: string; locked?: boolean };
```

```tsx
export default function MissionChat({ reportId, locked = false }: Props) {
```

Replace the existing composer row (the `<View style={styles.composerRow}>...</View>` block at the
bottom of the JSX) with a conditional: when `locked`, render a read-only note instead of the
`TextField`/`Button` pair:

```tsx
      {locked ? (
        <Text style={styles.lockedNote}>🔒 This mission is complete — chat is read-only.</Text>
      ) : (
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
      )}
```

Add the matching style next to `composerRow` in `createStyles`:

```ts
    lockedNote: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.sm },
```

- [ ] **Step 2: Pass `locked` and show the completion photo/note in `RequestDetailsScreen`**

Open `apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx`. Change the
`<MissionChat reportId={reportId} />` call to:

```tsx
            <MissionChat reportId={reportId} locked={report.status === 'completed'} />
```

Add a completion display block. `Report` doesn't currently carry the completion photo/note (only
`libs-mobile/api/missions.ts`'s roster-adjacent types do) — the simplest option that needs no new
endpoint: extend `getRoster()`'s response to include the completion when one exists, since
`RequestDetailsScreen` already fetches `roster`. Do this in Task 5 retroactively if you're reading
tasks in order and haven't finished Task 5 yet — otherwise, as a self-contained addition here:

1. In `apps/api/src/missions/missions.service.ts`'s `getRoster()`, add a `completion` field to the
   returned object (and to the `RosterResponse` type at the top of the file):

```ts
type RosterResponse = {
  neededVolunteers: number;
  volunteers: RosterVolunteer[];
  myStatus: VolunteerStatusKey | null;
  myConfirmDeadline: string | null;
  completion: { photoUrl: string; note: string; verifiedAt: string } | null;
};
```

   Inside `getRoster()`, after fetching `rows`/`mine` (near the end of the method, before the
   `return`), fetch the completion if one exists:

```ts
    const [completionRow] = await db
      .select()
      .from(missionCompletions)
      .where(eq(missionCompletions.missionId, missionId));
```

   (Add this fetch to both the early-return branch — where `missionId` is null, return
   `completion: null` — and the main branch below it.) Add `completion:
   completionRow ? { photoUrl: completionRow.photoUrl, note: completionRow.note, verifiedAt:
   completionRow.verifiedAt!.toISOString() } : null,` to the returned object.

2. In `libs-mobile/api/missions.ts`, add `completion: { photoUrl: string; note: string; verifiedAt: string } | null;`
   to the `Roster` type.

3. Back in `RequestDetailsScreen.tsx`, after the `<RosterSection .../>` line, add:

```tsx
        {roster.completion && (
          <View style={styles.completionBox}>
            <Text style={styles.completionTitle}>✅ Mission Completed</Text>
            <Image source={{ uri: roster.completion.photoUrl }} style={styles.completionPhoto} />
            <Text style={styles.completionNote}>{roster.completion.note}</Text>
          </View>
        )}
```

   Add matching styles to `createStyles` (mirror the existing `chatLocked`/`chatLockedText`
   pattern already in this file for the box, plus a photo style similar to the existing top
   `photo` style but smaller — your call on exact dimensions using `SPACING`/`RADIUS` tokens).

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Rebuild the API and re-verify**

Since Step 2 changed `MissionsService.getRoster()`, rebuild: `docker compose up -d --build api`,
then re-run a subset of Task 3's curl checks (`GET /reports/:id/volunteers` for a completed
mission) to confirm the `completion` field appears with the right shape.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/missions/missions.service.ts libs-mobile/api/missions.ts \
  apps/mobile/src/screens/request-details/MissionChat.tsx \
  apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx
git commit -m "feat: lock Mission Chat and show the completion photo/note after completion"
```

---

### Task 9: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full mobile typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: zero errors across the whole app.

- [ ] **Step 2: Full mobile bundle export**

Run: `cd apps/mobile && npx expo export --platform ios --output-dir /tmp/uthavu-mission-completion-check`
Expected: bundles cleanly, no resolution errors. Then: `rm -rf /tmp/uthavu-mission-completion-check`.

- [ ] **Step 3: Full backend test suite**

Run: `cd apps/api && npx jest missions.service.spec.ts reports.service.spec.ts users.service.spec.ts otp-rate-limiter.spec.ts --forceExit`
Expected: all tests pass, no regressions in the pre-existing suites.

- [ ] **Step 4: Push**

```bash
git push origin main
```

## Self-review notes

**Spec coverage:** US-1 → Task 6/7 (composer + roster wiring). US-2 → Task 2 (`isGenuineUpload` +
`complete()`). US-3 → Task 8 (chat lock). US-4 → Task 8 (completion display). BR-1..BR-9 → Task 2's
`complete()` body and Task 1's schema (unique FK for BR-6's idempotency). All "Out of scope" items
from the spec are explicitly not touched by any task above.

**Type consistency:** `RosterResponse`/`Roster` gain the same `completion` field shape in both
`missions.service.ts` (Task 8) and `libs-mobile/api/missions.ts` (Task 8) — verified matching.
`completeMission()`'s return type (`Roster`) matches what `POST /reports/:id/complete` actually
returns (`RosterResponse`, via `complete()`'s own `return this.getRoster(...)`).
