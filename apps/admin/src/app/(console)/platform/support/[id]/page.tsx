import { AccessDeniedState, BackButton } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";
import { canManageSupport } from "@/features/support-tickets/permission";
import { SUPPORT_INDEX } from "@/features/support-tickets/routes";
import { TicketWorkbench } from "@/features/support-tickets/ticket-workbench";

export const metadata = { title: "Ticket" };

/**
 * One support ticket, worked.
 *
 * Frame comes from `platform/layout.tsx` (SubMenuPageLayout, Mode B scroll):
 * the Platform sub-menu is still there, so an agent who finishes a ticket is
 * one click from the queue rather than from the browser's back button. This
 * page therefore sets no `max-w-*`, no `mx-auto` and no page padding.
 *
 * A server component only to await `params` and resolve the permission — the
 * ticket itself is fetched client-side by `TicketWorkbench` so replying,
 * resolving and every control change can invalidate and re-render in place.
 * Same split as `reports/[id]/page.tsx` and `announcements/[id]/page.tsx`.
 *
 * NO SUBJECT IN THE HEADING. The obvious thing — fetching the ticket here to
 * title the page with it — would mean requesting it twice, on the server for a
 * heading and again in the browser for the screen, and the two would disagree
 * for as long as the second was in flight. The subject is the first thing in
 * the conversation below anyway.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, canManage] = await Promise.all([params, canManageSupport()]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2">
          <BackButton href={SUPPORT_INDEX} label="Support queue" />
        </div>
        <h2 className="mt-1 text-lg font-extrabold tracking-tight text-fg">Ticket</h2>
        <p className="mt-0.5 text-fg-subtle">
          The whole conversation, staff notes included. Replies go to the citizen; internal notes
          never do.
        </p>
      </div>

      {canManage ? <TicketWorkbench ticketId={id} /> : <AccessDeniedState {...ACCESS_DENIED.support} />}
    </div>
  );
}
