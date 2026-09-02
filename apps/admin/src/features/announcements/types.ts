/**
 * Shapes returned by the announcements endpoints.
 *
 * The wire still spells the path and the record "community-update"; the UI calls
 * the feature "Announcements". That split is deliberate — see `./api.ts`.
 *
 * Transcribed from the FROZEN contract agreed with the backend agent building
 * this module in parallel — not from running code. As of writing the API
 * answers 404 for every path below, which the console renders honestly (see
 * `classifyListFailure`'s 404 branch: "That list doesn't exist yet"). Nothing
 * here fabricates a row to fill the gap.
 *
 *   GET    /admin/community-updates?page&limit&status&q
 *   GET    /admin/community-updates/:id
 *   POST   /admin/community-updates
 *   PATCH  /admin/community-updates/:id
 *   POST   /admin/community-updates/:id/publish
 *   POST   /admin/community-updates/:id/archive
 *   DELETE /admin/community-updates/:id            -> 204 (SOFT delete)
 *
 * Every one of them requires `platform:manage`. Read and write share the single
 * permission, so there is no "can look but not touch" state to render — the
 * page is gated whole, server-side, in `permission.ts`.
 */

/** The keys this build knows how to colour. Others still render, via the API's label. */
export type CommunityUpdateStatusKey = "draft" | "published" | "archived";

/**
 * Deliberately `{ key, label }` with a `string` key, matching `AdminRoleRef` in
 * `src/lib/roles.ts`: the API authors the display text and owns the status
 * lookup table, so a status added server-side must render with its real name
 * rather than making the row look broken until the console is redeployed.
 */
export type CommunityUpdateStatus = { key: string; label: string };

export type AdminUpdate = {
  id: string;
  /** Required by the API. This is what a citizen sees when no Tamil exists. */
  titleEn: string;
  bodyEn: string;
  /** Optional. `null` means "fall back to the English above" — see UpdateForm. */
  titleTa: string | null;
  bodyTa: string | null;
  status: CommunityUpdateStatus;
  publishAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  author: { id: string; name: string } | null;
  /**
   * The author's account was deleted; the update it wrote survives. Separate
   * from `author === null` (never had one — a seed or a system post), and the
   * two read very differently to an operator.
   */
  authorDeleted: boolean;
};

/** The body `POST /admin/community-updates` and `PATCH …/:id` accept. */
export type CommunityUpdatePayload = {
  titleEn: string;
  bodyEn: string;
  titleTa: string | null;
  bodyTa: string | null;
  publishAt: string | null;
  expiresAt: string | null;
};
