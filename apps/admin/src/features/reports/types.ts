/**
 * Shapes returned by `GET /admin/reports` and `GET /admin/reports/:id`.
 * Transcribed from `apps/api/src/admin/admin-reports.service.ts` and checked
 * against the running container.
 *
 * NOTE WHAT IS ABSENT: there is no `messages` field, and there is no endpoint
 * that would return one. Mission Chat is private between the reporter and the
 * volunteers who accepted, and the API excludes it from the admin projection on
 * purpose. Do not add a panel, a fetch, or a "coming soon" placeholder for it —
 * a placeholder is a promise, and the decision was that admins never read
 * `mission_messages`.
 */

/**
 * Every status an admin surface can receive, mirroring `EFFECTIVE_STATUSES` in
 * `apps/api/src/reports/report-effective-status.ts`.
 *
 * `pending_review` and `rejected` arrived with photo verification and are
 * FIRST-CLASS members, not special cases: they are stored keys like `closed`
 * and `completed`, the API's derived-status expression already returns them,
 * and its status filter derives its enum from the same constant. Leaving them
 * out of this union would give the console a status it can receive and cannot
 * name — which is how a moderation queue ends up rendering a raw database key
 * at an operator.
 *
 * `expired` is still the one value nothing ever writes; see ReportStatusBadge.
 */
export type ReportStatus =
  | "open"
  | "pending_review"
  | "expired"
  | "closed"
  | "completed"
  | "rejected"
  | "deleted";

export type ReportReporter = {
  id: string | null;
  deleted: boolean;
  /** True when the reporter chose to be anonymous to other citizens. */
  anonymousToPublic: boolean;
  name: string | null;
  avatarUrl: string | null;
  phoneNumber: string | null;
};

export type AdminReportRow = {
  id: string;
  title: string;
  description: string;
  /** DERIVED by the API. Never the stored column — see ReportStatusBadge. */
  status: ReportStatus;
  storedStatus: string;
  category: { key: string; label: string; emoji: string | null };
  reporter: ReportReporter;
  anonymous: boolean;
  phoneVisible: boolean;
  location: { lat: number; lng: number; landmark: string | null };
  neededVolunteers: number;
  counts: { photos: number; comments: number; activeVolunteers: number };
  createdAt: string;
  expiryAt: string;
  closedAt: string | null;
  deletedAt: string | null;
};

export type AdminReportDetail = {
  id: string;
  title: string;
  description: string;
  status: ReportStatus;
  storedStatus: string;
  storedStatusLabel: string;
  expired: boolean;
  category: { key: string; label: string; emoji: string | null };
  reporter: ReportReporter & { city: string | null; district: string | null };
  anonymous: boolean;
  phoneVisible: boolean;
  location: { lat: number; lng: number; landmark: string | null };
  neededVolunteers: number;
  photos: Array<{ id: string; url: string; createdAt: string }>;
  volunteers: Array<{
    id: string;
    userId: string | null;
    name: string | null;
    deleted: boolean;
    avatarUrl: string | null;
    phoneNumber: string | null;
    status: { key: string; label: string };
    progress: string | null;
    joinedAt: string;
    /** The 15-minute acceptance window. Checked lazily, never by a cron. */
    confirmDeadline: string;
    confirmedAt: string | null;
    releasedAt: string | null;
    releaseReason: string | null;
  }>;
  completion: {
    id: string;
    photoUrl: string | null;
    note: string | null;
    status: string;
    submittedAt: string;
    verifiedAt: string | null;
    completedBy: { id: string; name: string | null } | null;
  } | null;
  counts: {
    photos: number;
    comments: number;
    saves: number;
    volunteers: number;
    activeVolunteers: number;
  };
  createdAt: string;
  updatedAt: string;
  expiryAt: string;
  closedAt: string | null;
  deletedAt: string | null;
  deletedBy: { id: string; name: string; email: string | null } | null;
};

export type ReportCategory = {
  id: string;
  key: string;
  label: string;
  emoji: string | null;
};
