import { PageLayout } from "@/components/layout";
import { BroadcastEditor } from "@/features/broadcasts/broadcast-editor";
import { BroadcastsAccessDenied } from "@/features/broadcasts/broadcasts-access-denied";
import { canManageBroadcasts } from "@/features/broadcasts/permission";

export const metadata = { title: "Broadcast" };

/**
 * One broadcast: edit it while it is still a draft, send it, or read the record
 * of one that has already gone out.
 *
 * A server component only to await `params` and resolve the permission; the
 * record itself is fetched client-side by `BroadcastEditor` so send / cancel /
 * delete can invalidate and re-render in place. Same split as
 * `reports/[id]/page.tsx` and `announcements/[id]/page.tsx`.
 *
 * The subtitle deliberately does NOT promise the page is editable. Whether it
 * is depends on the status, which is not known until the record loads — see
 * `BroadcastEditor`, which renders a read-only record for anything past
 * `scheduled`.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, canManage] = await Promise.all([params, canManageBroadcasts()]);

  return (
    <PageLayout
      eyebrow="Community"
      title="Broadcast"
      subtitle="Drafts and scheduled broadcasts can still be changed. Once one has been sent it becomes a record — the copy is on people's phones and this console can no longer alter it."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Community" },
        { label: "Broadcasts", href: "/community/broadcasts" },
        { label: "Broadcast" },
      ]}
      contentWidth="wide"
    >
      {canManage ? <BroadcastEditor broadcastId={id} /> : <BroadcastsAccessDenied />}
    </PageLayout>
  );
}
