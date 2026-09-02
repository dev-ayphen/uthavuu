import { PageLayout } from "@/components/layout";
import { canManageSponsors } from "@/features/sponsors/permission";
import { SponsorForm } from "@/features/sponsors/sponsor-form";
import { SponsorsAccessDenied } from "@/features/sponsors/sponsors-access-denied";

export const metadata = { title: "New Sponsor" };

/**
 * Add a sponsor.
 *
 * A full page rather than a dialog over the list: there are twelve fields
 * across four concerns, and the point of the layout is seeing the creative,
 * its placements and the campaign window together before an advertisement goes
 * out to every citizen in the network. A modal narrow enough to sit over a
 * table cannot do that — and the prototype's answer to the same problem, a
 * six-step wizard, is discussed and rejected in `SponsorForm`'s header.
 *
 * Gated server-side on the same permission as the list — the create route needs
 * `platform:manage` too, so an ops admin reaching this URL directly is shown
 * why rather than being handed a form the API will refuse.
 */
export default async function Page() {
  const canManage = await canManageSponsors();

  return (
    <PageLayout
      eyebrow="Revenue"
      title="New sponsor"
      subtitle="Only the sponsor name is required — everything else can be filled in later, and nothing is shown to citizens until the campaign is activated."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Monetization", href: "/monetization" },
        { label: "Sponsors", href: "/monetization/sponsors" },
        { label: "New" },
      ]}
      contentWidth="wide"
    >
      {canManage ? <SponsorForm record={null} /> : <SponsorsAccessDenied />}
    </PageLayout>
  );
}
