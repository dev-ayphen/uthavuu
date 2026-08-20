# Impact Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone with the app view a completed mission as a public Impact Story (before/after photos, who helped, how long it took), like it, and share it via a deep link — reusing existing data end to end.

**Architecture:** No new screen, no new module. `ReportsService`/`ReportsController` (existing) gain a `report_likes` table and two endpoints; `RequestDetailsScreen` (existing) renders a new `ImpactStorySection` component instead of the active-request layout once a report is `completed`. Everything else the story needs (before photo, after photo, roster, caption, comments) already exists from `report-a-request`, `accept-and-mission-chat`, and `mission-completion`.

**Tech Stack:** NestJS + Drizzle + PostgreSQL (Docker), Expo/React Native + React Query, `@uthavu/libs-mobile` shared package, `react-i18next`.

**Spec:** [`docs/features/impact-story.md`](../../features/impact-story.md)

## Global Constraints

- UUIDv7 primary keys via the `uuidv7` npm package, generated at insert time (no native `uuidv7()` on this Postgres).
- Migrations only — `pnpm db:generate` then `pnpm db:migrate`, never `db:push`.
- No lookup table for likes — a like is a plain existence/toggle fact, not a status with valid transitions (spec's Data touched section).
- Every new user-facing mobile string goes through `useTranslation()` against the existing namespaced catalogs (EN+TA) — no hardcoded copy.
- File-size discipline: `ImpactStorySection.tsx` is its own file; do not inline it into `RequestDetailsScreen.tsx`.
- No new Maestro flow (spec's Out of scope) — final verification is manual (curl + a live simulator check).
- **Before running `pnpm db:generate`/`db:migrate` (Task 1, Step 5): read `docs/coordination.md`'s current state.** As of this plan's writing, the migration-series lock is held by a peer session (`uthavuu-db`) with an uncommitted migration (`0007_blushing_katie_power.sql`) in the working tree. Do not proceed with the migration step if that lock is still held without coordinating first — the lock may have released by the time this task executes; check, don't assume either way.

---

### Task 1: `report_likes` schema + migration

**Files:**
- Create: `apps/api/src/db/schema/likes-schema.ts`
- Modify: `apps/api/src/db/index.ts` (register the new schema module — Drizzle's query API needs it in the `schema` object, not just picked up by drizzle-kit's file glob)
- Create (generated): a new file under `apps/api/drizzle/` via `db:generate`

**Interfaces:**
- Produces: `reportLikes` table (Drizzle table object) with columns `id`, `reportId`, `userId`, `createdAt`, and a composite unique index on `(reportId, userId)`. Task 2 imports this as `import { reportLikes } from '../db/schema/likes-schema';`.

- [ ] **Step 1: Write the schema file**

```ts
// apps/api/src/db/schema/likes-schema.ts
// docs/features/impact-story.md BR-6/BR-7/BR-8: a like is a plain
// existence/toggle fact with no valid-transition rules to enforce, same
// reasoning alerts.type already uses for staying plain text — no lookup
// table. Idempotency (BR-7) and one-like-per-user (BR-8) are both enforced
// by the unique index below, not just application-level checks.
import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { reports } from './reports-schema';

export const reportLikes = pgTable(
  'report_likes',
  {
    id: uuid('id').primaryKey(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('report_likes_report_id_idx').on(table.reportId),
    uniqueIndex('report_likes_report_id_user_id_key').on(table.reportId, table.userId),
  ]
);

export const reportLikeRelations = relations(reportLikes, ({ one }) => ({
  report: one(reports, { fields: [reportLikes.reportId], references: [reports.id] }),
  user: one(user, { fields: [reportLikes.userId], references: [user.id] }),
}));
```

- [ ] **Step 2: Register the schema in `db/index.ts`**

Modify `apps/api/src/db/index.ts` — add the import and spread it into `schema`:

```ts
import * as likesSchema from './schema/likes-schema';
```

```ts
const schema = {
  ...authSchema,
  ...reportsSchema,
  ...missionsSchema,
  ...devicesSchema,
  ...alertsSchema,
  ...commentsSchema,
  ...likesSchema,
};
```

- [ ] **Step 3: Type-check the schema file**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Check `docs/coordination.md` before generating a migration**

Run: `cat docs/coordination.md`
Expected: confirm the migration-series lock row. If it still shows `uthavuu-db (peer)` holding it with an uncommitted migration, do not proceed — either wait, or coordinate directly (this session already left a note there; check for a reply/handoff). If the lock has been released (row updated or removed, peer's migration committed), proceed to Step 5 and update the lock row to name this session while the migration is in flight, then release it again in the same commit as Step 6.

- [ ] **Step 5: Generate and run the migration**

Run: `pnpm db:generate` (from repo root)
Expected: a new file appears under `apps/api/drizzle/`, e.g. `000X_<name>.sql`, containing `CREATE TABLE "report_likes" (...)` and the unique index.

Run: `pnpm db:migrate`
Expected: migration applies cleanly against the dev Postgres (Docker, host port 5433) with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema/likes-schema.ts apps/api/src/db/index.ts apps/api/drizzle/
git commit -m "feat: report_likes schema + migration"
```

If Step 4 required claiming the coordination lock, also update `docs/coordination.md` to release it in this same commit.

---

### Task 2: `ReportsService.like()`/`unlike()` + `toResponse()` extension

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`

**Interfaces:**
- Consumes: `reportLikes` table from Task 1.
- Produces: `ReportsService.like(reportId: string, requestingUserId: string): Promise<ReportResponse>`, `ReportsService.unlike(reportId: string, requestingUserId: string): Promise<ReportResponse>` — both return the same shape `findOne()` already returns (now with `likeCount`/`likedByMe` fields). Task 3's controller calls these directly. Task 4 (mobile) mirrors this response shape in the `Report` type.

- [ ] **Step 1: Add the import**

In `apps/api/src/reports/reports.service.ts`, add to the existing imports:

```ts
import { reportLikes } from '../db/schema/likes-schema';
```

- [ ] **Step 2: Add a `requireCompletedReport` guard**

Add this private method, right after the existing `requireOwnedOpenReport` (same file) — mirrors its exact pattern:

```ts
  // impact-story.md BR-6: a like only makes sense once a report is a
  // finished Impact Story — enforced here, not just hidden client-side.
  private async requireCompletedReport(reportId: string): Promise<ReportRow> {
    const [existing] = await db.select().from(reports).where(eq(reports.id, reportId));
    if (!existing) throw new NotFoundException('Report not found');

    const [status] = await db.select().from(reportStatuses).where(eq(reportStatuses.id, existing.statusId));
    if (status?.key !== 'completed') throw new ForbiddenException('This report is not completed yet');

    return existing;
  }
```

- [ ] **Step 3: Add `like()` and `unlike()`**

Add these public methods, near `close()`:

```ts
  // impact-story.md BR-7: idempotent both ways — ON CONFLICT DO NOTHING
  // means liking an already-liked report is a no-op, not a duplicate or
  // an error.
  async like(reportId: string, requestingUserId: string) {
    await this.requireCompletedReport(reportId);

    await db
      .insert(reportLikes)
      .values({ id: uuidv7(), reportId, userId: requestingUserId })
      .onConflictDoNothing({ target: [reportLikes.reportId, reportLikes.userId] });

    return this.findOne(reportId, requestingUserId);
  }

  // Deleting a non-existent like is a no-op (0 rows affected, no error) —
  // idempotent by construction, no extra existence check needed.
  async unlike(reportId: string, requestingUserId: string) {
    await db
      .delete(reportLikes)
      .where(and(eq(reportLikes.reportId, reportId), eq(reportLikes.userId, requestingUserId)));

    return this.findOne(reportId, requestingUserId);
  }
```

- [ ] **Step 4: Compute `likeCount`/`likedByMe` in `findOne()`**

In `findOne()` (same file), after the existing `hasActiveVolunteerAccess` line and before the `return this.toResponse(...)` call, add:

```ts
    const [{ count: likeCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportLikes)
      .where(eq(reportLikes.reportId, reportId));

    const myLikeRows = await db
      .select()
      .from(reportLikes)
      .where(and(eq(reportLikes.reportId, reportId), eq(reportLikes.userId, requestingUserId)));
```

Then change the existing `return this.toResponse(...)` call in `findOne()` to pass two more arguments at the end:

```ts
    return this.toResponse(
      row.report,
      row.category,
      row.status,
      photos.map((p) => p.url),
      row.reporter,
      requestingUserId,
      hasActiveVolunteerAccess,
      likeCount,
      myLikeRows.length > 0
    );
```

- [ ] **Step 5: Extend `toResponse()`'s signature and output**

Change the `toResponse()` method signature (same file) to accept two new optional trailing parameters:

```ts
  private toResponse(
    report: ReportRow,
    category: CategoryRow,
    status: StatusRow,
    photoUrls: string[],
    reporter: typeof user.$inferSelect,
    requestingUserId: string,
    hasActiveVolunteerAccess: boolean,
    likeCount = 0,
    likedByMe = false
  ) {
```

Add `likeCount` and `likedByMe` to the returned object, right after `reporterPhone`:

```ts
      reporterPhone: isOwner || (hasActiveVolunteerAccess && report.phoneVisible) ? reporter.phoneNumber : null,
      likeCount,
      likedByMe,
    };
```

`list()`'s existing call to `toResponse()` is unchanged — it only ever returns `open` reports, so the new params correctly default to `0`/`false` there (a like can't exist on a report that was never `completed`).

- [ ] **Step 6: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. `sql` and `and` are already imported at the top of this file (`import { and, eq, inArray, sql } from 'drizzle-orm';` — `distanceKmExpr` already uses `sql`, `requireOwnedOpenReport`-style guards already use `and`), so no import changes are needed beyond the `reportLikes` import from Step 1.

- [ ] **Step 7: Rebuild the API container**

Run: `docker compose up -d --build api` (from repo root)
Expected: container rebuilds and starts without errors. Check with `docker compose logs api --tail 30`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports/reports.service.ts
git commit -m "feat: ReportsService.like()/unlike() + likeCount/likedByMe on report responses"
```

---

### Task 3: `ReportsController` endpoints + curl verification

**Files:**
- Modify: `apps/api/src/reports/reports.controller.ts`

**Interfaces:**
- Consumes: `ReportsService.like()`/`unlike()` from Task 2.
- Produces: `POST /reports/:id/like`, `DELETE /reports/:id/like`. Task 6 (mobile client) calls these by URL.

- [ ] **Step 1: Add `Delete` to the NestJS import**

Change the first import line in `apps/api/src/reports/reports.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
```

- [ ] **Step 2: Add the two routes**

Add these methods, after the existing `close()` method:

```ts
  @Post(':id/like')
  like(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.reportsService.like(id, session.user.id);
  }

  @Delete(':id/like')
  unlike(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.reportsService.unlike(id, session.user.id);
  }
```

- [ ] **Step 3: Type-check and rebuild**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

Run: `docker compose up -d --build api` (from repo root)
Expected: container rebuilds and starts. Check `docker compose logs api --tail 30` for a clean NestJS boot with the new routes mapped (`Mapped {/reports/:id/like, POST}` etc. in the log).

- [ ] **Step 4: Curl-verify — set up a completed report fixture**

This needs a report walked through the full lifecycle. Using the dev-OTP flow already established this session (request OTP, read the code from `docker compose logs api --tail 30`, verify to get a bearer token) for two users — a reporter and a volunteer — then:

```bash
# 1. Reporter creates a report (categoryKey must be citizen-selectable — 'medicalHelp' works)
curl -s -X POST http://localhost:3001/reports \
  -H "Authorization: Bearer $REPORTER_TOKEN" -H "Content-Type: application/json" \
  -d '{"categoryKey":"medicalHelp","title":"Impact Story test","description":"test","lat":13.08,"lng":80.27,"anonymous":false,"phoneVisible":false,"neededVolunteers":1,"photoUrls":["http://localhost:3001/uploads/<some-real-uploaded-file>"]}'
# capture the returned "id" as $REPORT_ID

# 2. Volunteer accepts, then confirms within the window
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/volunteers -H "Authorization: Bearer $VOLUNTEER_TOKEN"
curl -s -X PATCH http://localhost:3001/reports/$REPORT_ID/volunteers/me -H "Authorization: Bearer $VOLUNTEER_TOKEN"

# 3. Volunteer completes (photoUrl must be a real uploaded file — use POST /uploads first, same as mission-completion's own curl verification)
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/complete \
  -H "Authorization: Bearer $VOLUNTEER_TOKEN" -H "Content-Type: application/json" \
  -d '{"photoUrl":"http://localhost:3001/uploads/<some-real-uploaded-file>","note":"test completion"}'
```

Expected: report is now `completed` — confirm with `curl -s http://localhost:3001/reports/$REPORT_ID -H "Authorization: Bearer $REPORTER_TOKEN"` showing `"status":"completed"`, `"likeCount":0`, `"likedByMe":false`.

- [ ] **Step 5: Curl-verify — the like/unlike endpoints, including negative cases**

```bash
# Like as the reporter
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/like -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: 200, body shows "likeCount":1, "likedByMe":true

# Duplicate like — idempotent, not a duplicate
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/like -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: 200, "likeCount" still 1

# Like as the volunteer too — count goes to 2, and it's per-user
curl -s -X POST http://localhost:3001/reports/$REPORT_ID/like -H "Authorization: Bearer $VOLUNTEER_TOKEN"
# Expected: 200, "likeCount":2, "likedByMe":true (from the volunteer's perspective)
curl -s http://localhost:3001/reports/$REPORT_ID -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: "likeCount":2, "likedByMe":true (still true for the reporter, who liked it separately)

# Unlike
curl -s -X DELETE http://localhost:3001/reports/$REPORT_ID/like -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: 200, "likeCount":1, "likedByMe":false (for the reporter)

# Unlike again — idempotent, not an error
curl -s -X DELETE http://localhost:3001/reports/$REPORT_ID/like -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: 200, "likeCount" still 1

# Like on a NOT-completed report — rejected
# (create a second, fresh 'open' report as $REPORT_ID_2, then:)
curl -s -X POST http://localhost:3001/reports/$REPORT_ID_2/like -H "Authorization: Bearer $REPORTER_TOKEN"
# Expected: 403 "This report is not completed yet"
```

- [ ] **Step 6: Clean up test fixtures**

Delete the two test reports and the two test users created for this verification, same pattern used earlier this session for alerts/comments/my-missions curl verification.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/reports.controller.ts
git commit -m "feat: POST/DELETE /reports/:id/like endpoints"
```

---

### Task 4: Backend Jest tests

**Files:**
- Modify: `apps/api/src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.like()`/`unlike()` from Task 2, `MissionsService.accept()`/`confirm()`/`complete()` (existing, from `mission-completion.md`'s build).

- [ ] **Step 1: Add the imports this test block needs**

At the top of `apps/api/src/reports/reports.service.spec.ts`, add (alongside the existing imports):

```ts
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from '../uploads/multer.config';
```

- [ ] **Step 2: Add a `describe('like()/unlike()', ...)` block**

Add this as a new top-level `describe` block inside the existing `describe('ReportsService', ...)`, after the existing test blocks (this file already has `reporterId`, `otherUserId`, `medicalCategoryId`, and `service`/`missionsService` in scope from the outer `describe`'s `beforeAll` — reuse them, don't redeclare):

```ts
  describe('like()/unlike()', () => {
    const fixtureFilename = 'test-like-photo.jpg';
    const fixturePhotoUrl = `${process.env.BETTER_AUTH_URL}/uploads/${fixtureFilename}`;
    let completedReportId: string;

    beforeAll(async () => {
      writeFileSync(join(UPLOADS_DIR, fixtureFilename), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const created = await service.create(reporterId, baseInput({ title: 'Like test report' }));
      completedReportId = created.id;
      await missionsService.accept(completedReportId, otherUserId);
      await missionsService.confirm(completedReportId, otherUserId);
      await missionsService.complete(completedReportId, otherUserId, fixturePhotoUrl, 'done');
    });

    afterAll(() => {
      unlinkSync(join(UPLOADS_DIR, fixtureFilename));
    });

    it('rejects a like on a report that is not completed', async () => {
      const openReport = await service.create(reporterId, baseInput({ title: 'Still open report' }));
      await expect(service.like(openReport.id, reporterId)).rejects.toThrow('This report is not completed yet');
    });

    it('records a like and increments likeCount', async () => {
      const result = await service.like(completedReportId, reporterId);
      expect(result.likeCount).toBe(1);
      expect(result.likedByMe).toBe(true);
    });

    it('is idempotent — liking twice does not duplicate', async () => {
      await service.like(completedReportId, reporterId);
      const result = await service.like(completedReportId, reporterId);
      expect(result.likeCount).toBe(1);
    });

    it('likedByMe is per-user', async () => {
      const asOtherUser = await service.findOne(completedReportId, otherUserId);
      expect(asOtherUser.likeCount).toBe(1);
      expect(asOtherUser.likedByMe).toBe(false);
    });

    it('unlike removes the like', async () => {
      const result = await service.unlike(completedReportId, reporterId);
      expect(result.likeCount).toBe(0);
      expect(result.likedByMe).toBe(false);
    });

    it('unlike is idempotent — unliking when not liked does not error', async () => {
      const result = await service.unlike(completedReportId, reporterId);
      expect(result.likeCount).toBe(0);
    });
  });
```

Note: `missionsService` must be in scope in this file — confirm the outer `describe`'s existing setup already has `const missionsService = new MissionsService(new AlertsService());` (it does, per this file's current header). If the outer scope's variable is named differently, use that name instead.

- [ ] **Step 3: Run the tests**

Run: `cd apps/api && pnpm test reports.service.spec.ts --forceExit`
Expected: all tests pass, including the new `like()/unlike()` block.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/reports/reports.service.spec.ts
git commit -m "test: like()/unlike() coverage — completed-only gate, idempotency, per-user likedByMe"
```

---

### Task 5: Mobile API client — `Report` type + `likeReport()`/`unlikeReport()`

**Files:**
- Modify: `libs-mobile/api/reports.ts`

**Interfaces:**
- Produces: `Report` type gains `likeCount: number` and `likedByMe: boolean`. `likeReport(reportId: string): Promise<Report>`, `unlikeReport(reportId: string): Promise<Report>`. Task 7 (`ImpactStorySection.tsx`) imports and calls these.

- [ ] **Step 1: Extend the `Report` type**

In `libs-mobile/api/reports.ts`, add two fields to the `Report` type, after `reporterPhone`:

```ts
  reporterPhone: string | null;
  likeCount: number;
  likedByMe: boolean;
};
```

- [ ] **Step 2: Add the two client functions**

Add these after the existing `listReports()` function, following the exact style of `libs-mobile/api/missions.ts`'s `leaveRequest()`:

```ts
export function likeReport(reportId: string): Promise<Report> {
  return apiRequest(`/reports/${reportId}/like`, { method: 'POST', auth: true });
}

export function unlikeReport(reportId: string): Promise<Report> {
  return apiRequest(`/reports/${reportId}/like`, { method: 'DELETE', auth: true });
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs-mobile/api/reports.ts
git commit -m "feat: likeReport()/unlikeReport() client + Report.likeCount/likedByMe"
```

---

### Task 6: `formatDuration()` + new i18n keys

**Files:**
- Modify: `libs-mobile/lib/time.ts`
- Modify: `libs-mobile/i18n/locales/en/common.json`, `libs-mobile/i18n/locales/ta/common.json`
- Modify: `libs-mobile/i18n/locales/en/requestDetails.json`, `libs-mobile/i18n/locales/ta/requestDetails.json`

**Interfaces:**
- Produces: `formatDuration(startIso: string, endIso: string): string` in `libs-mobile/lib/time.ts`. Task 7 imports this.

- [ ] **Step 1: Add `formatDuration()` to `time.ts`**

Add this function to `libs-mobile/lib/time.ts`, after the existing `formatRelativeTime()` — same imperative `i18next.t()` style, same single-largest-unit logic, but for elapsed duration between two timestamps rather than "ago" phrasing:

```ts
// Elapsed duration between two timestamps ("2 hours", not "2 hours ago") —
// used by ImpactStorySection for "Helped in {{duration}}". Same
// single-largest-unit approach as formatRelativeTime, distinct wording.
export function formatDuration(startIso: string, endIso: string): string {
  const msElapsed = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (msElapsed < 60_000) return i18next.t('durationLessThanAMinute');

  const minutes = Math.floor(msElapsed / 60_000);
  if (minutes < 60) return i18next.t('durationMinutes', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18next.t('durationHours', { count: hours });

  const days = Math.floor(hours / 24);
  return i18next.t('durationDays', { count: days });
}
```

- [ ] **Step 2: Add the new `common` namespace keys**

Add to `libs-mobile/i18n/locales/en/common.json` (alongside the existing `minutesAgo`/`hoursAgo`/`daysAgo` keys):

```json
  "durationLessThanAMinute": "less than a minute",
  "durationMinutes_one": "{{count}} minute",
  "durationMinutes_other": "{{count}} minutes",
  "durationHours_one": "{{count}} hour",
  "durationHours_other": "{{count}} hours",
  "durationDays_one": "{{count}} day",
  "durationDays_other": "{{count}} days"
```

Add the Tamil equivalents to `libs-mobile/i18n/locales/ta/common.json` — mirror the exact plural-key structure used by the existing `minutesAgo_one`/`minutesAgo_other` pair in that same file (read it first to match tone/register), translating the meaning ("less than a minute", "X minute(s)", "X hour(s)", "X day(s)") rather than copying the "ago" phrasing.

- [ ] **Step 3: Add the new `requestDetails` namespace keys**

Add to `libs-mobile/i18n/locales/en/requestDetails.json`:

```json
  "impactStoryLabel": "✨ Impact Story",
  "helpedInDuration": "Helped in {{duration}}",
  "share": "Share",
  "shareMessage": "See how the Uthavu community helped with \"{{title}}\":"
```

Add the Tamil equivalents to `libs-mobile/i18n/locales/ta/requestDetails.json`, same keys, translated meaning.

- [ ] **Step 4: Remove the now-orphaned `completionTitle` key**

Task 7 removes `RequestDetailsScreen.tsx`'s old completion box (which used `t('completionTitle')`) in favor of `ImpactStorySection`. Remove the `"completionTitle": "✅ Mission Completed"` line from both `libs-mobile/i18n/locales/en/requestDetails.json` and `ta/requestDetails.json` now, so Task 7 doesn't leave a dead key behind.

- [ ] **Step 5: Verify EN/TA key parity**

Run the same key-parity check used for the original i18n batch (compares every key in each `en/*.json` against its `ta/*.json` pair, not spot checks). If no such script currently exists as a saved file, write a small one-off:

```bash
cd libs-mobile/i18n/locales && python3 -c "
import json, sys
for ns in ['common', 'requestDetails']:
    en = json.load(open(f'en/{ns}.json'))
    ta = json.load(open(f'ta/{ns}.json'))
    missing_in_ta = set(en) - set(ta)
    missing_in_en = set(ta) - set(en)
    if missing_in_ta or missing_in_en:
        print(f'{ns}: missing in ta={missing_in_ta}, missing in en={missing_in_en}')
        sys.exit(1)
print('OK — key parity confirmed for common and requestDetails')
"
```

Expected: `OK — key parity confirmed for common and requestDetails`. Fix any gap before moving on.

- [ ] **Step 6: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (this step mainly matters after Task 7 wires `formatDuration()` in; running it now just confirms `time.ts` itself compiles).

- [ ] **Step 7: Commit**

```bash
git add libs-mobile/lib/time.ts libs-mobile/i18n/locales/en/common.json libs-mobile/i18n/locales/ta/common.json libs-mobile/i18n/locales/en/requestDetails.json libs-mobile/i18n/locales/ta/requestDetails.json
git commit -m "feat: formatDuration() + Impact Story i18n keys (EN+TA)"
```

---

### Task 7: `ImpactStorySection.tsx`

**Files:**
- Create: `apps/mobile/src/screens/request-details/ImpactStorySection.tsx`

**Interfaces:**
- Consumes: `Report` type + `likeReport()`/`unlikeReport()` (Task 5), `formatDuration()` (Task 6), `Roster`/`MissionCompletion` types (existing, `libs-mobile/api/missions.ts`), `RosterSection` (existing, unchanged — reused as-is for the "who helped" list).
- Produces: `ImpactStorySection` component, default export, props `{ reportId: string; report: Report; roster: Roster }`. Task 8 renders this from `RequestDetailsScreen.tsx`.

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/src/screens/request-details/ImpactStorySection.tsx
// docs/features/impact-story.md — renders in place of the active-request
// layout once a report is completed. Reuses RosterSection unchanged for
// "who helped" (it already renders the roster with no action buttons once
// roster.completion exists — see RosterSection.tsx's own myStatus guards).
import { useMemo } from 'react';
import { Alert, Image, Share, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Heart, Share2 } from 'lucide-react-native';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { likeReport, unlikeReport, type Report } from '@uthavu/libs-mobile/api/reports';
import type { Roster } from '@uthavu/libs-mobile/api/missions';
import { formatDuration } from '@uthavu/libs-mobile/lib/time';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Button from '@uthavu/libs-mobile/components/Button';
import RosterSection from './RosterSection';

type Props = {
  reportId: string;
  report: Report;
  roster: Roster;
};

export default function ImpactStorySection({ reportId, report, roster }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const completion = roster.completion;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['report', reportId] });
  const onError = (e: unknown) => {
    Alert.alert(t('couldNotCompleteThat'), e instanceof ApiError ? e.message : t('common:tryAgain'));
  };

  const likeMutation = useMutation({ mutationFn: () => likeReport(reportId), onSuccess: invalidate, onError });
  const unlikeMutation = useMutation({ mutationFn: () => unlikeReport(reportId), onSuccess: invalidate, onError });

  const onToggleLike = () => {
    if (report.likedByMe) unlikeMutation.mutate();
    else likeMutation.mutate();
  };

  const onShare = async () => {
    const link = `uthavu://requests/${reportId}`;
    try {
      await Share.share({
        message: `${t('shareMessage', { title: report.title })} ${link}`,
        url: link,
      });
    } catch {
      // A dismissed/failed share sheet isn't a real error — nothing to surface.
    }
  };

  // Should always be non-null when this component renders (RequestDetailsScreen
  // only mounts it for report.status === 'completed', and a report can't be
  // completed without a mission_completions row) — guarded defensively anyway
  // rather than assuming the two states can never drift apart.
  if (!completion) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.storyLabel}>{t('impactStoryLabel')}</Text>

      <Image source={{ uri: completion.photoUrl }} style={styles.afterPhoto} />

      <Text style={styles.duration}>
        {t('helpedInDuration', { duration: formatDuration(report.createdAt, completion.verifiedAt) })}
      </Text>

      <Text style={styles.caption}>{completion.note}</Text>

      <View style={styles.actionsRow}>
        <Button
          label={String(report.likeCount)}
          icon={
            <Heart
              size={ICON_SIZE.sm}
              color={report.likedByMe ? colors.danger : colors.textSecondary}
              fill={report.likedByMe ? colors.danger : 'none'}
            />
          }
          variant="ghost"
          onPress={onToggleLike}
          loading={likeMutation.isPending || unlikeMutation.isPending}
        />
        <Button
          label={t('share')}
          icon={<Share2 size={ICON_SIZE.sm} color={colors.textSecondary} />}
          variant="ghost"
          onPress={onShare}
        />
      </View>

      <RosterSection reportId={reportId} report={report} roster={roster} />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: { marginTop: SPACING.md },
    storyLabel: { ...TYPE.captionStrong, color: colors.primaryGreen, marginBottom: SPACING.xs },
    afterPhoto: { width: '100%', height: 200, borderRadius: RADIUS.lg, marginBottom: SPACING.sm },
    duration: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xs },
    caption: { ...TYPE.body, color: colors.textSecondary, marginBottom: SPACING.md },
    actionsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  });
```

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors. (This will still show errors from `RequestDetailsScreen.tsx` not yet importing/using this component — that's fine, Task 8 wires it in next. If `tsc` reports unused-export-style noise for this new file in isolation, ignore it; the real check is after Task 8.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/request-details/ImpactStorySection.tsx
git commit -m "feat: ImpactStorySection component"
```

---

### Task 8: Wire `ImpactStorySection` into `RequestDetailsScreen` + remove the old completion box

**Files:**
- Modify: `apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx`

**Interfaces:**
- Consumes: `ImpactStorySection` from Task 7.

- [ ] **Step 1: Add the import**

In `apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx`, add alongside the existing `RosterSection` import:

```ts
import ImpactStorySection from './ImpactStorySection';
```

- [ ] **Step 2: Replace the RosterSection + completion-box block**

Find this existing block:

```tsx
        <RosterSection reportId={reportId} report={report} roster={roster} />

        {roster.completion && (
          <View style={styles.completionBox}>
            <Text style={styles.completionTitle}>{t('completionTitle')}</Text>
            <Image source={{ uri: roster.completion.photoUrl }} style={styles.completionPhoto} />
            <Text style={styles.completionNote}>{roster.completion.note}</Text>
          </View>
        )}
```

Replace it with:

```tsx
        {report.status === 'completed' ? (
          <ImpactStorySection reportId={reportId} report={report} roster={roster} />
        ) : (
          <RosterSection reportId={reportId} report={report} roster={roster} />
        )}
```

- [ ] **Step 3: Remove the now-unused styles**

In the same file's `createStyles()`, remove the `completionBox`, `completionTitle`, `completionPhoto`, and `completionNote` style entries — `ImpactStorySection` owns its own styles now, and nothing in this file references them anymore.

- [ ] **Step 4: Verify `CommunityComments` still renders for a completed report**

Read the rest of the file to confirm `<CommunityComments reportId={reportId} />` (near the bottom, after the `MissionChat`/`chatLocked` block) is unconditional — it should still be outside any `report.status` check, so it keeps rendering for both active and completed reports without any change needed. If it's somehow nested inside a conditional that would exclude the completed case, fix that — comments must keep working post-completion per `impact-story.md` US-3.

- [ ] **Step 5: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors, including no "unused import" or "unused style" warnings for the removed styles.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/request-details/RequestDetailsScreen.tsx
git commit -m "feat: render ImpactStorySection for completed reports"
```

---

### Task 9: Deep linking

**Files:**
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Produces: `uthavu://requests/:reportId` resolves to the existing `RequestDetails` route.

- [ ] **Step 1: Add the `linking` config**

In `apps/mobile/src/navigation/RootNavigator.tsx`, add above the `RootNavigator` function:

```ts
const linking = {
  prefixes: ['uthavu://'],
  config: {
    screens: {
      RequestDetails: 'requests/:reportId',
    },
  },
};
```

Then pass it to `NavigationContainer`:

```tsx
    <NavigationContainer linking={linking}>
```

Known, accepted limitation (not fixed by this task — matches `impact-story.md` US-4 AC3's "no web fallback" scoping): a deep link opened by a signed-out user, or a user who never completed onboarding, will still attempt to mount `RequestDetailsScreen` directly and its `getReport()`/`getRoster()` calls will fail with an auth error — already handled gracefully by the screen's existing `ErrorState` (ret can retry, won't crash), just not a polished "log in first" redirect. Out of scope for this pass.

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify the deep link on the simulator**

With the Expo dev server running and the app open via Expo Go (or a dev build), while already logged in and viewing any screen:

```bash
xcrun simctl openurl booted "uthavu://requests/<a-real-report-id-you-have-access-to>"
```

Expected: the app navigates directly to that report's `RequestDetails` screen.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "feat: uthavu://requests/:reportId deep link"
```

---

### Task 10: Final verification pass

**Files:** none new — verification only.

- [ ] **Step 1: Full mobile type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Metro bundle export**

Run: `cd apps/mobile && npx expo export --platform ios --output-dir /tmp/impact-story-bundle-check`
Expected: succeeds with no module-resolution errors (this project's established stronger-than-typecheck check, since it touches several new cross-package imports — `likeReport`/`unlikeReport` from `libs-mobile/api/reports`, `formatDuration` from `libs-mobile/lib/time`, the new JSON i18n keys).

- [ ] **Step 3: i18n key-parity re-check**

Re-run the script from Task 6 Step 5 (or extend it to cover all 5 namespaces, not just the two touched here) to confirm nothing drifted during Tasks 6–9.

- [ ] **Step 4: Full backend test suite**

Run: `cd apps/api && pnpm test --forceExit`
Expected: all tests pass, including the new `like()/unlike()` block from Task 4 and everything pre-existing.

- [ ] **Step 5: Live manual verification on the simulator**

With the API running (`docker compose up -d api`) and the Expo dev server running: log in as a volunteer with an already-completed mission (or walk one through report → accept → confirm → complete via the UI, reusing the same manual flow used to verify `mission-completion.md`), open that report's `RequestDetails` screen, and confirm:
- The Impact Story layout renders (before photo up top, after photo, duration, caption, roster, Like, Share) instead of the active-request layout.
- Tapping Like increments the count and the heart fills in; tapping again un-likes.
- Comments still render and can be posted, below the story.
- Share opens the native share sheet.

- [ ] **Step 6: Push**

```bash
git push origin main
```

Before pushing, re-check `docs/coordination.md` one more time in case the peer session's state changed during this plan's execution.

---

## Self-Review Notes (from plan authoring)

- **Spec coverage:** US-1 (Task 8, Task 7's before/after+duration+caption+roster), US-2 (Task 1–3, 5, 7), US-3 (Task 8 Step 4 — verified unchanged, no code needed), US-4 (Task 9). BR-1–BR-10 all map to a task: BR-1/BR-2 (no new authored content, no caching — Task 7 reads `roster.completion.note` directly, nothing precomputed), BR-3 (Task 8's `report.reporter` reuse, unchanged from existing anonymity handling), BR-4 (no opt-out field added anywhere in this plan — correct, matches spec), BR-5 (no feed/list endpoint added — correct), BR-6/BR-7/BR-8 (Task 1's unique index + Task 2's guard/idempotency), BR-9 (no new alert code anywhere in this plan — correct), BR-10 (Task 9's deep-link-only approach, no server-rendered page).
- **Type consistency checked:** `Report.likeCount`/`likedByMe` (Task 5) match `toResponse()`'s new fields (Task 2) match what `ImpactStorySection` reads (Task 7). `formatDuration(startIso, endIso)` (Task 6) matches its call site `formatDuration(report.createdAt, completion.verifiedAt)` (Task 7) — both are ISO strings, matching `Report.createdAt: string` and `MissionCompletion.verifiedAt: string`'s existing types.
- **No placeholders:** every step has real, complete code — no "add validation" or "similar to Task N" hand-waving.
