import Link from "next/link";
import { Plus } from "lucide-react";

import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { Button } from "@/components/ui";
import { BROADCASTS_LIST, BroadcastsTable } from "@/features/broadcasts/broadcasts-table";
import { BroadcastsAccessDenied } from "@/features/broadcasts/broadcasts-access-denied";
import { canManageBroadcasts } from "@/features/broadcasts/permission";
import { BROADCASTS_NEW } from "@/features/broadcasts/routes";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

export const metadata = { title: "Broadcasts" };

/**
 * Community -> Broadcasts. Push notifications the console sends TO citizens.
 *
 * WHY THIS IS NOT ANNOUNCEMENTS
 * ───────────────────────────────────────────────────────────────────────────
 * They look identical on a form and they are opposite in the way that decides
 * everything else (ADR 0013). An announcement is PULLED — one row, no
 * recipient, read by whoever opens the app, and reversible by archiving it. A
 * broadcast is PUSHED — one alert row per recipient plus an FCM notification,
 * arriving whether or not the app is open, with no un-send. That is why this
 * page carries an audience, a reach, and a send dialog that makes you type the
 * district before it will fire.
 *
 * A server component only to resolve the permission. Everything below the
 * `ListStateProvider` is client-side, because the URL is the list's store.
 */
export default async function Page() {
  // Mirrors `platform:manage`, which `AdminBroadcastsController` enforces at
  // class level on every route in this feature. UX only — read and write share
  // the permission, so there is no "view but don't touch" state: the page is
  // gated whole.
  const canManage = await canManageBroadcasts();

  return (
    <PageLayout
      eyebrow="Community"
      title="Broadcasts"
      subtitle="A push notification to every citizen, or to one district. English is what everyone falls back to; Tamil is what Tamil readers get when it exists. Sending cannot be undone."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Community" },
        { label: "Broadcasts" },
      ]}
      contentWidth="wide"
      // Hidden, not disabled, for an admin without the permission: the compose
      // route is gated too, so the button could only ever lead to a refusal.
      // Disabling it would imply the action exists for them and is merely
      // unavailable right now.
      actions={
        canManage ? (
          <Button size="sm" asChild>
            <Link href={BROADCASTS_NEW}>
              <Plus />
              New broadcast
            </Link>
          </Button>
        ) : null
      }
    >
      {canManage ? (
        <ListStateProvider
          config={BROADCASTS_LIST}
          fallback={<ListPageSkeleton columns={7} filters={1} />}
        >
          <BroadcastsTable />
        </ListStateProvider>
      ) : (
        <BroadcastsAccessDenied />
      )}
    </PageLayout>
  );
}
