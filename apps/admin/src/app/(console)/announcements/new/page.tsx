import { AccessDeniedState } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";
import { PageLayout } from "@/components/layout";
import { canManageAnnouncements } from "@/features/announcements/permission";
import { UpdateForm } from "@/features/announcements/update-form";

export const metadata = { title: "New Announcement" };

/**
 * Write a new announcement — admin-authored, broadcast to citizens.
 *
 * The create archetype gets a full page rather than a dialog over the list:
 * there are six fields, two of them long-form bodies in different scripts, and
 * the whole point of the layout is showing English and Tamil side by side. A
 * modal narrow enough to sit over a table cannot do that.
 *
 * Gated server-side on the same permission as the list — the create route needs
 * `platform:manage` too, so an ops admin reaching this URL directly is shown
 * why rather than being handed a form the API will refuse.
 */
export default async function Page() {
  const canManage = await canManageAnnouncements();

  return (
    <PageLayout
      eyebrow="Publishing"
      title="New announcement"
      subtitle="English is required and is what every citizen falls back to. Tamil is optional — leave it blank and Tamil readers see the English."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Announcements", href: "/announcements" },
        { label: "New" },
      ]}
      contentWidth="wide"
    >
      {canManage ? <UpdateForm record={null} /> : <AccessDeniedState {...ACCESS_DENIED.announcements} />}
    </PageLayout>
  );
}
