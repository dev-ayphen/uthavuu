import Link from "next/link";
import { Plus } from "lucide-react";

import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { AccessDeniedState, Button } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";
import { canManageAnnouncements } from "@/features/announcements/permission";
import { ANNOUNCEMENTS_NEW } from "@/features/announcements/routes";
import { UPDATES_LIST, UpdatesTable } from "@/features/announcements/updates-table";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

export const metadata = { title: "Announcements" };

/**
 * Announcements the console publishes INTO the mobile app.
 *
 * WHY THIS IS NOT CALLED "COMMUNITY UPDATES"
 * ───────────────────────────────────────────────────────────────────────────
 * It was, briefly, and that was a naming collision rather than a feature.
 * "Community Updates" already means the PUBLIC, per-report information feed —
 * anyone may post to it and everyone can read it — which this codebase ships as
 * Community Comments (`report_comments`) and moderates at `/reports/comments`.
 *
 * This section is the opposite: admin-authored, bilingual announcements
 * broadcast from the console to every citizen in the network. One is citizen
 * content the console moderates; the other is console content citizens read.
 * They now have separate names and separate places in the nav.
 *
 * The HTTP path is still `/admin/community-updates` and the table is still
 * `community_updates` — deliberate, and explained in
 * `features/announcements/api.ts`.
 *
 * A server component only to resolve the permission. Everything below the
 * `ListStateProvider` is client-side, because the URL is the list's store.
 */
export default async function Page() {
  // Mirrors `platform:manage` for UX only — the API enforces it on every route
  // in this section. Read and write share the permission, so there is no
  // "view but don't touch" state: the page is gated whole.
  const canManage = await canManageAnnouncements();

  return (
    <PageLayout
      eyebrow="Publishing"
      title="Announcements"
      subtitle="Written here, broadcast to citizens in the mobile app. English is what every citizen falls back to; Tamil is what Tamil readers get when it exists."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Announcements" }]}
      contentWidth="wide"
      // Hidden, not disabled, for an admin without the permission: the create
      // route is gated too, so the button could only ever lead to a refusal.
      // Disabling it would imply the action exists for them and is merely
      // unavailable right now.
      actions={
        canManage ? (
          <Button size="sm" asChild>
            <Link href={ANNOUNCEMENTS_NEW}>
              <Plus />
              New announcement
            </Link>
          </Button>
        ) : null
      }
    >
      {canManage ? (
        <ListStateProvider config={UPDATES_LIST} fallback={<ListPageSkeleton columns={6} filters={1} />}>
          <UpdatesTable />
        </ListStateProvider>
      ) : (
        <AccessDeniedState {...ACCESS_DENIED.announcements} />
      )}
    </PageLayout>
  );
}
