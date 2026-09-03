import { PageLayout } from "@/components/layout";
import { BroadcastForm } from "@/features/broadcasts/broadcast-form";
import { BroadcastsAccessDenied } from "@/features/broadcasts/broadcasts-access-denied";
import { canManageBroadcasts } from "@/features/broadcasts/permission";

export const metadata = { title: "New Broadcast" };

/**
 * Compose a broadcast. It is saved as a DRAFT — this page cannot send.
 *
 * Creating and sending are two acts with two audit rows, on purpose: an
 * endpoint that could do both would make "who decided to notify fifty thousand
 * people" answerable only by diffing JSON. So the form saves, the page
 * redirects to the record, and Send lives there behind its own dialog.
 *
 * The compose archetype gets a full page rather than a dialog over the list:
 * there are seven fields, two of them long-form bodies in different scripts,
 * and the whole point of the layout is showing English and Tamil side by side.
 * A modal narrow enough to sit over a table cannot do that.
 *
 * Gated server-side on the same permission as the list — `POST` needs
 * `platform:manage` too, so an ops admin reaching this URL directly is shown
 * why rather than handed a form the API will refuse.
 */
export default async function Page() {
  const canManage = await canManageBroadcasts();

  return (
    <PageLayout
      eyebrow="Community"
      title="New broadcast"
      subtitle="Write it, choose who it goes to, and save it as a draft. Nothing reaches anybody until you press Send on the saved broadcast."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Community" },
        { label: "Broadcasts", href: "/community/broadcasts" },
        { label: "New" },
      ]}
      contentWidth="wide"
    >
      {canManage ? <BroadcastForm record={null} /> : <BroadcastsAccessDenied />}
    </PageLayout>
  );
}
