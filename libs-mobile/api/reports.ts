// Matches apps/api/src/reports/* — see docs/features/report-a-request.md.
import { apiRequest } from '../lib/api';
import type { CategoryId } from '../data/categories';

export type ReportCategory = {
  key: CategoryId;
  label: string;
  emoji: string;
  defaultExpiryMinutes: number;
};

export type Report = {
  id: string;
  category: { key: CategoryId; label: string; emoji: string };
  // The real backend vocabulary — a reporter-cancelled report is 'closed',
  // not a separate 'cancelled' status (see docs/features/edit-cancel-report.md
  // "no cancelled status was added — closed is reused"). There is no
  // report-level 'active'/'in_progress' status either — a report stays
  // 'open' for the whole time a mission is in progress; only
  // mission_volunteers tracks joined/active/released.
  //
  // NOT A CLOSED FOUR ANY MORE. Photo verification added two, and this comment
  // previously asserted the older list as if it were final — it wasn't, and a
  // client that treats an unknown status as its `default:` branch renders the
  // new ones as "Open", which is the specific lie this note now exists to stop:
  //
  //   pending_review — created, but one of its photos is being checked. NOT
  //                    visible to volunteers, so it is not "open"; the reporter
  //                    can see it and is waiting on us.
  //   rejected       — a moderator refused it. Terminal, and not the same thing
  //                    as 'closed' (which the reporter chose) or 'expired'.
  //
  // The server sends the DERIVED status (report-effective-status.ts), so
  // 'expired' arrives here without ever being stored. 'deleted' exists in that
  // same derivation but is admin-only — citizen endpoints filter soft-deleted
  // rows out entirely, so it is deliberately absent from this union.
  status: 'open' | 'pending_review' | 'closed' | 'expired' | 'completed' | 'rejected';
  title: string;
  description: string;
  lat: number;
  lng: number;
  landmark: string | null;
  anonymous: boolean;
  phoneVisible: boolean;
  neededVolunteers: number;
  // Only populated by getMyReports() — how many volunteers are currently
  // joined/active on this report's mission.
  assignedVolunteersCount?: number;
  photos: string[];
  expiryAt: string;
  closedAt: string | null;
  createdAt: string;
  isOwner: boolean;
  // Null either because the reporter posted anonymously (reporterDeleted:
  // false) or because their account has since been deleted (reporterDeleted:
  // true) — always check reporterDeleted before rendering; "Deleted User"
  // and "Posted anonymously" are different states and must never be
  // conflated on screen.
  reporter: { name: string; avatarUrl: string | null } | null;
  reporterDeleted: boolean;
  reporterPhone: string | null;
  savedByMe: boolean;
  // Server-computed: open AND no volunteer has joined/is active yet. Same
  // rule PATCH /reports/:id enforces — read this instead of re-deriving it
  // client-side, so the two can't drift.
  editable: boolean;
};

export type ReportWithDistance = Report & { distanceKm: number };

export type CategorySummary = { key: CategoryId; activeCount: number; urgentCount: number };

export type CreateReportInput = {
  categoryKey: CategoryId;
  title: string;
  description: string;
  lat: number;
  lng: number;
  landmark?: string;
  anonymous: boolean;
  phoneVisible: boolean;
  neededVolunteers?: number;
  /**
   * Minutes from now, and it may only SHORTEN the category default — the server
   * applies `Math.min(expiryMinutes, categoryDefault)` (reports.service.ts), so
   * asking for longer silently gets the default rather than an error.
   *
   * Omitted entirely when the reporter did not choose, which is not the same as
   * sending the default: the category owns that number, and hardcoding it here
   * would freeze a value an admin can change in the console.
   */
  expiryMinutes?: number;
  /**
   * Verified-upload ids from `POST /uploads/report-photo`, 1–4 of them.
   *
   * IDS, NOT URLS. This used to be `photoUrls`, and the server used to accept
   * them — which meant the only thing standing between a report and any image
   * on earth was a check that the URL looked like one this API had served.
   * Nothing had ever looked at the picture. An id, by contrast, names a
   * verification record the API wrote itself: the client cannot manufacture one
   * and cannot alter the verdict attached to it, because the verdict is re-read
   * from the database on every attach.
   *
   * A `review` id is legal here and holds the whole report (status comes back
   * `pending_review`). A `reject` never produces an id at all.
   */
  photoUploadIds: string[];
};

/**
 * The API's 400-level codes for a photo that cannot be attached.
 *
 * Exported so screens map them to their own localised sentence instead of
 * rendering the server's English `message` — this app ships in two languages
 * and the API only speaks one.
 */
/**
 * `PUT /reports/:id/photos` only — the report is not `pending_review`.
 *
 * Deliberately NOT in REPORT_PHOTO_ERROR_CODES below: nothing is wrong with the
 * photo, so a screen that maps this onto "take another one" would send the
 * reporter back to the camera for a report that has already moved on (a
 * moderator rejected it, they cancelled it, it expired). Kept separate so the
 * two get different sentences.
 */
export const REPORT_NOT_AWAITING_PHOTO = 'REPORT_NOT_AWAITING_PHOTO';

export const REPORT_PHOTO_ERROR_CODES = [
  // The id isn't yours, doesn't exist, or was already spent on another report.
  'PHOTO_NOT_VERIFIED',
  // The verdict was reject. Should be unreachable from the capture flow, which
  // never holds an id for a rejected photo — reachable if one is spoofed.
  'PHOTO_REJECTED',
  // Post-publish paths only (edit, add-photo): a live report can't be pulled
  // back into review, so anything short of `pass` is refused there.
  'PHOTO_NEEDS_REVIEW',
  'PHOTO_REQUIRED',
  // The row says the photo exists and the disk disagrees.
  'PHOTO_UNAVAILABLE',
] as const;

export type ReportPhotoErrorCode = (typeof REPORT_PHOTO_ERROR_CODES)[number];

export function isReportPhotoErrorCode(code: string | undefined): code is ReportPhotoErrorCode {
  return REPORT_PHOTO_ERROR_CODES.includes(code as ReportPhotoErrorCode);
}

export function listReportCategories(): Promise<ReportCategory[]> {
  return apiRequest('/reports/categories', { method: 'GET', auth: true });
}

export function createReport(input: CreateReportInput): Promise<Report> {
  return apiRequest('/reports', { method: 'POST', auth: true, body: input });
}

export function getReport(id: string): Promise<Report> {
  return apiRequest(`/reports/${id}`, { method: 'GET', auth: true });
}

// discover-nearby-requests.md US-1 — active/urgent counts per category.
export function getReportsSummary(lat: number, lng: number, radiusKm: number): Promise<CategorySummary[]> {
  return apiRequest(
    `/reports/summary?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
    { method: 'GET', auth: true }
  );
}

export type CommunityStats = { activeVolunteers: number; helped: number };

// Dashboard header stats — activeVolunteers is radius-scoped (same area as
// the rest of the screen), helped is a real app-wide all-time count.
export function getCommunityStats(lat: number, lng: number, radiusKm: number): Promise<CommunityStats> {
  return apiRequest(
    `/reports/community-stats?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
    { method: 'GET', auth: true }
  );
}

// discover-nearby-requests.md US-3 — one category's open reports, nearest-first.
export function listReports(
  categoryKey: CategoryId,
  lat: number,
  lng: number,
  radiusKm: number
): Promise<ReportWithDistance[]> {
  return apiRequest(
    `/reports?categoryKey=${categoryKey}&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
    { method: 'GET', auth: true }
  );
}

export function saveReport(reportId: string): Promise<Report> {
  return apiRequest(`/reports/${reportId}/save`, { method: 'POST', auth: true });
}

export function unsaveReport(reportId: string): Promise<Report> {
  return apiRequest(`/reports/${reportId}/save`, { method: 'DELETE', auth: true });
}

// Profile → Saved Stories.
export function listSavedReports(): Promise<Report[]> {
  return apiRequest('/users/me/saved-reports', { method: 'GET', auth: true });
}

// Profile → My Reports.
export function getMyReports(): Promise<Report[]> {
  return apiRequest('/users/me/reports', { method: 'GET', auth: true });
}

// Category and lat/lng are immutable after publish — deliberately not part
// of this type. See UpdateReportSchema (apps/api/src/reports/dto/update-report.dto.ts).
export type UpdateReportInput = Partial<{
  title: string;
  description: string;
  landmark: string;
  neededVolunteers: number;
  anonymous: boolean;
  phoneVisible: boolean;
  /**
   * A full replacement of the report's photos, same currency as create.
   *
   * Stricter than create, though: this runs on an already-published report, so
   * the server refuses anything that is not already `pass` (PHOTO_NEEDS_REVIEW).
   * Volunteers may already be travelling to this report — it cannot be pulled
   * back into review by an edit, and holding just the new photo would mean an
   * invisible image nobody is told about. The reporter is asked to take another.
   */
  photoUploadIds: string[];
}>;

export function updateReport(id: string, body: UpdateReportInput): Promise<Report> {
  return apiRequest(`/reports/${id}`, { method: 'PATCH', auth: true, body });
}

/**
 * Replaces every photo on a HELD report — the reporter's reply to a moderator's
 * "please send a different photo".
 *
 * WHY THIS IS NOT `updateReport({ photoUploadIds })`. That path runs
 * `requireOwnedOpenReport()` server-side and refuses anything that is not
 * `open`, so a reporter sitting on a `pending_review` report literally could not
 * use it. The alert they receive ("New Photo Needed") was correct copy for
 * behaviour with no client at all: the refused upload stays `rejected`, which
 * `standingFor()` counts as refused, which blocks `publishIfReady()` forever —
 * the report was stuck for the reporter AND the moderator with no error raised
 * anywhere.
 *
 * FULL REPLACE, not a delta. The server detaches whatever was attached and
 * links this set, so sending the same ids twice cannot accumulate photos.
 *
 * THE IDS MUST COME FROM A FRESH `POST /uploads/report-photo`. There is no
 * gentler second path in for a photo a moderator already saw: `resolveUploads`
 * refuses any upload with a `reviewed_at`, so re-sending the refused one comes
 * back PHOTO_NOT_VERIFIED rather than being quietly held again.
 *
 * Both outcomes are successes and the caller must read `status` to tell them
 * apart: every replacement passing publishes the report (`open`), any of them
 * needing review leaves it `pending_review` for another moderator pass.
 *
 * Failure codes: REPORT_NOT_AWAITING_PHOTO (the report moved on),
 * PHOTO_NOT_VERIFIED (not yours / spent / already adjudicated), PHOTO_REJECTED,
 * PHOTO_UNAVAILABLE, REPORT_PHOTO_LIMIT.
 */
export function replaceHeldPhotos(reportId: string, photoUploadIds: string[]): Promise<Report> {
  return apiRequest(`/reports/${reportId}/photos`, {
    method: 'PUT',
    auth: true,
    body: { photoUploadIds },
  });
}

// Cancel Report reuses the existing close endpoint — see
// docs/features/edit-cancel-report.md for why there's no separate
// /cancel route or 'cancelled' status.
export function cancelReport(id: string): Promise<Report> {
  return apiRequest(`/reports/${id}/close`, { method: 'POST', auth: true });
}

export function deleteReport(id: string): Promise<{ id: string; deleted: true }> {
  return apiRequest(`/reports/${id}`, { method: 'DELETE', auth: true });
}
