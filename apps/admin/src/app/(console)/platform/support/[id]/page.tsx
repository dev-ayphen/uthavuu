import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { canManageSupport } from "@/features/support-tickets/permission";
import { SUPPORT_INDEX } from "@/features/support-tickets/routes";
import { SupportAccessDenied } from "@/features/support-tickets/support-access-denied";
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
        <Link
          href={SUPPORT_INDEX}
          className="inline-flex items-center gap-1 rounded-control text-[11px] font-semibold text-fg-faint transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden className="size-3" />
          Support queue
        </Link>
        <h2 className="mt-1 text-lg font-extrabold tracking-tight text-fg">Ticket</h2>
        <p className="mt-0.5 text-fg-subtle">
          The whole conversation, staff notes included. Replies go to the citizen; internal notes
          never do.
        </p>
      </div>

      {canManage ? <TicketWorkbench ticketId={id} /> : <SupportAccessDenied />}
    </div>
  );
}
