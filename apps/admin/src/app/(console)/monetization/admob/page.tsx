import { PageLayout } from "@/components/layout";
import { AdmobStatus } from "@/features/monetization/admob-status";
import { MonetizationAccessDenied } from "@/features/monetization/monetization-access-denied";
import { canViewMonetization } from "@/features/monetization/permission";

export const metadata = { title: "Google AdMob" };

/**
 * Google AdMob — integration status, not earnings.
 *
 * The subtitle is doing real work: an operator arriving from a sidebar item
 * called "Google AdMob" expects a revenue screen, and the first line has to
 * correct that before they go looking for a figure that was never here.
 *
 * A server component throughout. Nothing on this page fetches — every claim it
 * makes is a fact about this repository, recorded in `admob-integration.ts`
 * with the command that re-checks it — so there is no query, no client state
 * and no `"use client"`.
 */
export default async function Page() {
  // Same gate as the rest of Monetization, mirrored for UX only.
  const canView = await canViewMonetization();

  return (
    <PageLayout
      eyebrow="Revenue"
      title="Google AdMob"
      subtitle="Where ad money comes from, and what is still missing before a single figure can appear here. Google measures and pays AdMob earnings; this console can only ever display what Google reports."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Monetization", href: "/monetization" },
        { label: "AdMob" },
      ]}
    >
      {canView ? <AdmobStatus /> : <MonetizationAccessDenied />}
    </PageLayout>
  );
}
