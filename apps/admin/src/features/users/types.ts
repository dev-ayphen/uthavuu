/**
 * The shapes `GET /admin/users` and `GET /admin/users/:id` actually return.
 *
 * Transcribed from `apps/api/src/admin/admin-users.service.ts` and verified
 * against the running container, not from `docs/API-CONTRACT.md` — CLAUDE.md is
 * explicit that the doc set is a forward-looking spec whose technical claims
 * were fabricated, so it is not evidence about this endpoint.
 */

export type UserStatusKey = "active" | "suspended";

export type AdminUserRow = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  avatarUrl: string | null;
  locale: string | null;
  profileCompleted: boolean;
  profileCompletedAt: string | null;
  createdAt: string;
  status: { key: string; suspendedAt: string | null };
  isStaff: boolean;
  adminRole: { key: string; label: string } | null;
  counts: { reports: number; completions: number };
};

export type AdminUserDetail = {
  id: string;
  name: string;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  email: string | null;
  contactEmail: string | null;
  city: string | null;
  district: string | null;
  avatarUrl: string | null;
  locale: string | null;
  language: string | null;
  profession: string | null;
  organization: string | null;
  showProfession: boolean;
  preferredRadius: number | null;
  privacyDefaults: { anonymous: boolean; phoneVisible: boolean };
  profileCompleted: boolean;
  profileCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: {
    key: string;
    label: string;
    suspendedAt: string | null;
    /** The internal moderation note. Never shown to the suspended user. */
    reason: string | null;
    suspendedBy: { id: string; name: string; email: string | null } | null;
  };
  isStaff: boolean;
  adminRole: { key: string; label: string } | null;
  counts: {
    reports: {
      total: number;
      open: number;
      expired: number;
      closed: number;
      completed: number;
      deleted: number;
    };
    missions: { total: number; active: number; joined: number; released: number };
    completions: number;
    comments: number;
    flagsRaised: number;
    supportTickets: number;
  };
  recentReports: Array<{
    id: string;
    title: string;
    createdAt: string;
    expiryAt: string;
    /** DERIVED. See `report-effective-status.ts` — never the stored column. */
    status: string;
    storedStatus: string;
    category: { key: string; label: string; emoji: string | null };
  }>;
  recentMissions: Array<{
    id: string;
    missionId: string;
    reportId: string;
    reportTitle: string;
    reportStatus: string;
    volunteerStatus: string;
    joinedAt: string;
    releasedAt: string | null;
  }>;
};

export function isSuspended(status: { key: string }): boolean {
  return status.key === "suspended";
}
