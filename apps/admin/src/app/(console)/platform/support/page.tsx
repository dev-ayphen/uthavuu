import { AccessDeniedState } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";
import { ListStateProvider } from "@/components/data";
import { getAdminSession } from "@/lib/session";
import { canManageSupport } from "@/features/support-tickets/permission";
import { SupportTable, SupportTableSkeleton } from "@/features/support-tickets/support-table";
import { SUPPORT_LIST } from "@/features/support-tickets/use-support-tickets";

export const metadata = { title: "Support" };

/**
 * The support queue.
 *
 * Frame comes from `platform/layout.tsx` (SubMenuPageLayout, Mode B scroll), so
 * this page sets no `max-w-*`, no `mx-auto` and no page padding — the layout
 * owns all three.
 *
 * A server component only to resolve the session. Everything below the
 * `ListStateProvider` is client-side, because the URL is the list's store.
 *
 * WHY THE SESSION IS READ HERE AND PASSED DOWN
 * ───────────────────────────────────────────────────────────────────────────
 * Two things need it, and neither should re-fetch it. The permission mirror
 * gates the section (UX only — `AdminSupportController` enforces
 * `platform:manage` on every route). And the assignee filter needs this
 * operator's own id so "Assigned to … (you)" can be marked, which is what makes
 * "show me my tickets" one click instead of a hunt through a list of names.
 *
 * `getAdminSession()` is memoised per request by `serverApiFetch`'s caller
 * chain, so asking for it twice here costs one call to `GET /admin/me`.
 */
export default async function Page() {
  const [canManage, session] = await Promise.all([canManageSupport(), getAdminSession()]);

  if (!canManage) {
    return (
      <div className="space-y-4">
        <Heading />
        <AccessDeniedState {...ACCESS_DENIED.support} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Heading />

      <ListStateProvider config={SUPPORT_LIST} fallback={<SupportTableSkeleton />}>
        <SupportTable currentAdminId={session?.userId ?? null} />
      </ListStateProvider>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h2 className="text-lg font-extrabold tracking-tight text-fg">Support</h2>
      <p className="mt-0.5 text-fg-subtle">
        Feedback, bug reports and account problems raised from the mobile app — and support&rsquo;s
        replies. Open a ticket to read the conversation and answer it.
      </p>
    </div>
  );
}
