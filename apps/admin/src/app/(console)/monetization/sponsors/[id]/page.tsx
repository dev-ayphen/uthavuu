import { PageLayout } from "@/components/layout";
import { canManageSponsors } from "@/features/sponsors/permission";
import { SponsorEditor } from "@/features/sponsors/sponsor-editor";
import { SponsorsAccessDenied } from "@/features/sponsors/sponsors-access-denied";

export const metadata = { title: "Sponsor" };

/**
 * One sponsor, editable.
 *
 * A server component only to await `params` and resolve the permission; the
 * record itself is fetched client-side by `SponsorEditor` so pause / activate /
 * delete can invalidate and re-render in place. Same split as
 * `reports/[id]/page.tsx` and `announcements/[id]/page.tsx`.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, canManage] = await Promise.all([params, canManageSponsors()]);

  return (
    <PageLayout
      eyebrow="Revenue"
      title="Sponsor"
      subtitle="Edit the campaign, change where it appears, or pause it. Nothing here is shown to citizens while the campaign is paused."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Monetization", href: "/monetization" },
        { label: "Sponsors", href: "/monetization/sponsors" },
        { label: "Sponsor" },
      ]}
      contentWidth="wide"
    >
      {canManage ? <SponsorEditor sponsorId={id} /> : <SponsorsAccessDenied />}
    </PageLayout>
  );
}
