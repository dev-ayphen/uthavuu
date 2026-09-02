/**
 * Shapes on the `/admin/report-categories` wire.
 *
 * Transcribed from the running API, not guessed — every field below was read
 * off a live `GET /admin/report-categories` as a super admin, and the two
 * payload types match `CreateReportCategoryDto` / `UpdateReportCategoryDto`
 * field for field.
 *
 *   GET    /admin/report-categories        -> ReportCategoryRow[]  (bare array)
 *   POST   /admin/report-categories        -> 201 ReportCategoryRow
 *   PATCH  /admin/report-categories/:id    -> 200 ReportCategoryRow
 *   DELETE /admin/report-categories/:id    -> 200 { id, deleted: true }
 *
 * Every one of them is gated on `platform:manage` at the CLASS level, so read
 * and write share the single permission. There is no "can look but not touch"
 * state to render — the page is gated whole, server-side, in `permission.ts`.
 */

export type ReportCategoryRow = {
  id: string;
  /**
   * The stable identifier every other surface addresses this category by: the
   * mobile app posts it as `categoryKey`, `db/seed.ts` upserts ON CONFLICT on
   * it, and the citizen category list is keyed by it.
   *
   * It is therefore **immutable after creation** — `UpdateReportCategoryDto`
   * omits it deliberately, and the edit dialog shows it read-only rather than
   * offering a field the API would ignore.
   */
  key: string;
  label: string;
  emoji: string;
  /** How long a report in this category stays live before it expires. */
  defaultExpiryMinutes: number;
  /** False for admin-only categories, e.g. `disasterRelief` (BR-3). */
  citizenSelectable: boolean;
  /**
   * Reports currently using it, soft-deleted ones EXCLUDED.
   *
   * Deliberately not the same count `DELETE` checks: that one includes
   * soft-deleted rows, because the foreign key does not care that a report is
   * hidden. A category showing 0 here can still be refused a delete.
   */
  reportCount: number;
  createdAt: string;
  updatedAt: string;
};

/** The body `POST /admin/report-categories` accepts. */
export type CreateReportCategoryPayload = {
  key: string;
  label: string;
  emoji: string;
  defaultExpiryMinutes: number;
  citizenSelectable: boolean;
};

/** The body `PATCH /admin/report-categories/:id` accepts. No `key` — see above. */
export type UpdateReportCategoryPayload = Omit<CreateReportCategoryPayload, "key">;

/** What `DELETE /admin/report-categories/:id` answers with. */
export type DeleteReportCategoryResponse = { id: string; deleted: true };
