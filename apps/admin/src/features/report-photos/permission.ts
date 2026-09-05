import "server-only";

import { getAdminSession } from "@/lib/session";

/**
 * Server-side permission mirror for Reports -> Photo Verification.
 *
 * NOT A GATE. Every `/admin/report-photos` route — the queue, the summary, the
 * detail, the private image, and all three decisions — is enforced server-side
 * with `reports:manage`. This is UX only: it stops an admin being handed a page
 * of Approve / Reject buttons the API will refuse, which reads as a broken
 * console rather than as a boundary working correctly.
 *
 * The reports feature had no mirror of its own, which is why this one exists
 * here rather than being imported from a sibling: `features/reports/` gates
 * nothing server-side today, and adding the console's first one for a queue
 * whose buttons irreversibly publish or refuse a citizen's photograph is the
 * right place to start.
 *
 * CODE-DERIVED, NOT ASSUMED. `reports:manage` is the permission the report
 * moderation endpoints already carry, and photo verification transitions the
 * same reports — an approval is what makes a held report public. It is
 * deliberately NOT `comments:manage` (a different queue behind a different row
 * in `admin_role_permissions`) and deliberately NOT `platform:manage` (this is
 * a moderation decision, not a platform one).
 *
 * It uses the console's one existing mechanism — `getAdminSession()`, resolved
 * server-side from `GET /admin/me` — and never inspects the role key. Checking
 * `role.key === "super_admin"` instead would silently deny a new role the
 * moment the backend grants it `reports:manage`.
 *
 * It fails CLOSED: no session, an unreachable API, or a session carrying no
 * permissions all resolve to `false`.
 */

/** The permission every `/admin/report-photos` route requires. */
export const REPORT_PHOTOS_PERMISSION = "reports:manage";

export async function canReviewReportPhotos(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.permissions.includes(REPORT_PHOTOS_PERMISSION) ?? false;
}
