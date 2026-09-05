import { DashboardView } from "@/features/dashboard/dashboard-view";
import { dashboardPanelAccess } from "@/features/dashboard/permission";

export const metadata = { title: "Dashboard" };

/**
 * The console's landing page.
 *
 * A Server Component whose whole job is to answer one question the browser
 * cannot be trusted with: which of the two moderation panels this admin is
 * allowed to see. The answer comes from the session (`GET /admin/me`), resolved
 * server-side — never from a URL query string, which is the fail-open pattern
 * CLAUDE.md names as the thing not to build.
 *
 * Everything else lives in `DashboardView`, which is a client component because
 * every figure on the page is server state read through React Query.
 *
 * THE GATING HERE IS UX, NOT SECURITY. `GET /admin/reports` and
 * `GET /admin/flagged-comments` each carry their own
 * `@RequireAdminPermissions` and refuse anyone who lacks it, whatever this page
 * renders. Hiding a panel only stops an operator being shown a card that can
 * do nothing but say "you don't have permission" — see permission.ts.
 */
export default async function Page() {
  const access = await dashboardPanelAccess();

  return (
    <DashboardView
      canSeeUrgentRequests={access.urgentRequests}
      canSeeFlaggedComments={access.flaggedComments}
      canSeePhotoVerification={access.photoVerification}
    />
  );
}
