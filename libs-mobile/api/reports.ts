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
  status: 'open' | 'closed' | 'expired' | 'completed';
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
  photoUrls: string[];
};

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
  photoUrls: string[];
}>;

export function updateReport(id: string, body: UpdateReportInput): Promise<Report> {
  return apiRequest(`/reports/${id}`, { method: 'PATCH', auth: true, body });
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
