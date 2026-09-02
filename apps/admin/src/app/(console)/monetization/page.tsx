import { PageLayout } from "@/components/layout";
import { MonetizationAccessDenied } from "@/features/monetization/monetization-access-denied";
import { MonetizationOverview } from "@/features/monetization/monetization-overview";
import { canViewMonetization } from "@/features/monetization/permission";

export const metadata = { title: "Monetization Overview" };

/**
 * Monetization Overview — sponsor campaigns and AdMob, side by side and never
 * added together.
 *
 * A server component only to resolve the permission, exactly as the
 * announcements list does. Everything below is client-side because the campaign
 * counts come from React Query.
 *
 * The page sets no `max-w-*`, no `mx-auto` and no padding: it passes
 * `contentWidth` and lets `PageLayout` own all three.
 */
export default async function Page() {
  // Mirrors `platform:manage` for UX only — the API enforces it on the sponsors
  // endpoints this page reads. Read and write share the permission, so there is
  // no "view but don't touch" state: the page is gated whole.
  const canView = await canViewMonetization();

  return (
    <PageLayout
      eyebrow="Revenue"
      title="Monetization Overview"
      subtitle="Sponsor campaigns and Google AdMob, measured separately. Uthavu never charges citizens and no money moves between users."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Monetization" }]}
      contentWidth="wide"
    >
      {canView ? <MonetizationOverview /> : <MonetizationAccessDenied />}
    </PageLayout>
  );
}
