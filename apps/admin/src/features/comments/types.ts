/**
 * Shapes returned by `GET /admin/comments` and `GET /admin/flagged-comments`.
 * Transcribed from `apps/api/src/admin/admin-comments.service.ts`.
 *
 * These are the PUBLIC Community Comments on a report. `mission_messages` — the
 * private thread between a reporter and the volunteers who accepted — has no
 * admin endpoint and never appears here.
 */

export type AdminCommentRow = {
  id: string;
  body: string;
  createdAt: string;
  removed: boolean;
  removedAt: string | null;
  author: {
    id: string | null;
    name: string;
    avatarUrl: string | null;
    deleted: boolean;
  };
  report: {
    id: string;
    title: string;
    /** DERIVED status of the report this comment sits on. */
    effectiveStatus: string;
    category: { key: string; label: string; emoji: string | null };
  };
  flagCount: number;
  /** The person asking for help wrote this comment on their own request. */
  authorIsReporter: boolean;
};

/** The four seeded `flag_statuses` keys. */
export type FlagStatusKey = "submitted" | "under_review" | "action_taken" | "dismissed";

/** `submitted` is where a flag is CREATED; it is never a destination. */
export type ResolvableFlagStatusKey = Exclude<FlagStatusKey, "submitted">;

export type AdminFlaggedCommentRow = {
  id: string;
  reason: string;
  status: { key: string; label: string };
  createdAt: string;
  comment: {
    id: string;
    body: string;
    removed: boolean;
    createdAt: string;
    author: { id: string | null; name: string; deleted: boolean };
  };
  report: { id: string; title: string };
  flaggedBy: { id: string; name: string };
};
