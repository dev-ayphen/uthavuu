import Link from "next/link";
import { Plus } from "lucide-react";

import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { Button } from "@/components/ui";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";
import { canManageSponsors } from "@/features/sponsors/permission";
import { SPONSORS_NEW } from "@/features/sponsors/routes";
import { SponsorsAccessDenied } from "@/features/sponsors/sponsors-access-denied";
import { SPONSORS_LIST, SponsorsTable } from "@/features/sponsors/sponsors-table";

export const metadata = { title: "Sponsors" };

/**
 * Monetization -> Sponsors: the campaigns the mobile app's `<SponsorCard>`
 * renders, and the only revenue surface in this console that touches a citizen
 * screen.
 *
 * A server component only to resolve the permission. Everything below the
 * `ListStateProvider` is client-side, because the URL is the list's store —
 * a status tab and a search term have to survive a reload and a pasted link.
 */
export default async function Page() {
  // Mirrors `platform:manage` for UX only — the API enforces it on every route
  // in this section. Read and write share the permission, so there is no
  // "view but don't touch" state: the page is gated whole.
  const canManage = await canManageSponsors();

  return (
    <PageLayout
      eyebrow="Revenue"
      title="Sponsors"
      subtitle="Sponsor campaigns, their creatives, where they appear in the app, and when they run."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Monetization", href: "/monetization" },
        { label: "Sponsors" },
      ]}
      contentWidth="wide"
      // Hidden, not disabled, for an admin without the permission: the create
      // route is gated too, so the button could only ever lead to a refusal.
      // Disabling it would imply the action exists for them and is merely
      // unavailable right now.
      actions={
        canManage ? (
          <Button size="sm" asChild>
            <Link href={SPONSORS_NEW}>
              <Plus />
              Add sponsor
            </Link>
          </Button>
        ) : null
      }
    >
      {canManage ? (
        <ListStateProvider
          config={SPONSORS_LIST}
          fallback={<ListPageSkeleton columns={6} filters={0} />}
        >
          <SponsorsTable />
        </ListStateProvider>
      ) : (
        <SponsorsAccessDenied />
      )}
    </PageLayout>
  );
}
