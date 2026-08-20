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
  status: 'open' | 'closed' | 'expired' | 'completed';
  title: string;
  description: string;
  lat: number;
  lng: number;
  landmark: string | null;
  anonymous: boolean;
  phoneVisible: boolean;
  neededVolunteers: number;
  photos: string[];
  expiryAt: string;
  closedAt: string | null;
  createdAt: string;
  isOwner: boolean;
  reporter: { name: string; avatarUrl: string | null } | null;
  reporterPhone: string | null;
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
