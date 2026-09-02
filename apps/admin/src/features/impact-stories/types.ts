/**
 * Shapes returned by `GET /admin/impact-stories` and
 * `GET /admin/impact-stories/:id`.
 *
 * Transcribed from the FROZEN CONTRACT agreed with the backend lane, field for
 * field. Nothing here is inferred from the database and nothing is added
 * "while we're in here": a field the contract does not name is a field the API
 * does not send, and typing it optimistically turns a missing value into a
 * silent `undefined` in a cell rather than a compile error.
 *
 * NOTE WHAT IS ABSENT, IN BOTH DIRECTIONS:
 *
 * 1. MISSION CHAT. There is no `messages` field and no endpoint that would
 *    return one. The private thread between a reporter and the volunteers who
 *    accepted is gated server-side on `hasActiveAccess()`, and ADR 0010
 *    ("Mission Chat is not readable by admins in V1") decided that admins never
 *    read it — no projection, no count-plus-preview, not even behind
 *    `super_admin`. Do not add a field, a fetch, or a "coming soon" placeholder:
 *    a placeholder is a promise, and this one would be a promise to break a
 *    privacy guarantee.
 *
 * 2. MODERATION. There is no `approve`, `reject`, `publish` or `takeDown`
 *    anywhere in the contract, because whether Impact Stories need an approval
 *    workflow is an OPEN PRODUCT QUESTION (`docs/_audit/open-questions.md` #12:
 *    the `impactStoriesPending` nav badge implies a queue, but a completion is
 *    inserted already `verified` in the same statement that creates it). Until
 *    someone decides, this section is read-only. Shipping a button that implies
 *    a workflow would be inventing product from a nav label.
 *
 * 3. `category` here has a `key` and a `label` and NO `emoji`, unlike
 *    `AdminReportRow["category"]`. That is the contract; don't reach for an
 *    emoji that isn't sent.
 */

/**
 * A category from the `report_categories` lookup table. Keys are shared with
 * `GET /admin/reports`, which is why the two pages can use one filter source.
 */
export type ImpactStoryCategory = { key: string; label: string };

/**
 * The story's state, straight from a lookup table. Always RENDER `label` and
 * only ever BRANCH on `key` — a status the console has never heard of still
 * displays correctly instead of falling through to a blank cell.
 */
export type ImpactStoryStatus = { key: string; label: string };

/**
 * A person the console may link to.
 *
 * `name` is nullable even though the frozen contract wrote it bare: `user.name`
 * is nullable in the database and `AdminImpactStoriesService.toListItem()`
 * projects it straight through, so a row genuinely can arrive as
 * `{ id, name: null }`. Typing it `string` would be a lie the compiler cannot
 * catch and `name.trim()` would be the crash. Widening a nullability the API
 * really ships is not inventing a field.
 */
export type ImpactStoryPerson = { id: string; name: string | null };

export type ImpactStoryListItem = {
  id: string;
  reportId: string;
  reportTitle: string;
  category: ImpactStoryCategory;
  status: ImpactStoryStatus;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  /** ISO instant, or null. */
  submittedAt: string | null;
  /** ISO instant, or null. */
  verifiedAt: string | null;
  durationMinutes: number | null;

  /**
   * THE INVARIANT THIS TRIPLE EXISTS TO PROTECT
   * ─────────────────────────────────────────────────────────────────────────
   * `reporterDeleted` and `reporterAnonymous` are DIFFERENT FACTS and must
   * never be conflated in the UI (`docs/architecture/data.md`, invariant 3:
   * "'Deleted User' and 'Posted anonymously' must never be conflated in any
   * UI, admin included").
   *
   *   reporterDeleted    the account is gone. The story survived it, because
   *                      `reports.reporter_id` is SET NULL on delete. Nothing
   *                      to link to, and nobody to contact.
   *   reporterAnonymous  the account exists and the person is contactable —
   *                      they simply chose not to be named to other citizens.
   *
   * Rendering both as one grey "Unknown" destroys the only distinction a
   * moderator needs here: whether there is still a human on the other end.
   * See `story-identity.tsx` for the full four-way rendering.
   */
  reporter: ImpactStoryPerson | null;
  reporterDeleted: boolean;
  reporterAnonymous: boolean;

  /** No anonymity flag for helpers — the contract has none, so neither do we. */
  helper: ImpactStoryPerson | null;
  helperDeleted: boolean;
};

/**
 * One person on the mission's roster.
 *
 * `userId` and `name` are BOTH nullable and travel together: the service nulls
 * the name whenever the id is null, because a stale name beside a missing id is
 * how a deleted account gets rendered as though it still existed. Null here
 * means the volunteer deleted their account and `SET NULL` took the identity
 * while leaving the roster entry as community history.
 *
 * `status` is the STORED value, and invariant 5 applies: `mission_volunteers.status`
 * is evaluated lazily, so a row can still read `joined` past its 15-minute
 * confirm deadline. On a completed mission that is close to harmless — the
 * mission ended — but it must never be read as "currently helping".
 */
export type ImpactStoryVolunteer = {
  userId: string | null;
  name: string | null;
  status: ImpactStoryStatus;
};

export type ImpactStoryDetail = ImpactStoryListItem & {
  /** What the volunteer wrote when they submitted the completion. */
  note: string | null;
  /** The original help request's body, for context on what was asked for. */
  reportDescription: string | null;
  /**
   * The REPORT's photos — the "before" side — oldest first, and `photos[0]` is
   * `beforePhotoUrl`.
   *
   * The after-photo is NOT a member of this array. It lives on the completion
   * (`mission_completions.photo_url`) and reaches the console as
   * `afterPhotoUrl`. Verified against
   * `apps/api/src/admin/admin-impact-stories.service.ts:268-273`, which selects
   * from `report_photos` alone.
   *
   * So `photos.length` is a count of report photos, never "how many photos this
   * story has". Rendering it as a total silently loses the one image the story
   * exists to show.
   */
  photos: string[];
  volunteers: ImpactStoryVolunteer[];
};

export type ImpactStoryListResponse = {
  items: ImpactStoryListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};
