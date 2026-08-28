import { ListStateProvider } from "@/components/data";
import { AUDIT_LIST } from "@/features/audit-logs/use-audit-logs";
import { AuditTable, AuditTableSkeleton } from "@/features/audit-logs/audit-table";

export const metadata = { title: "Audit Logs" };

/**
 * A Server Component so `metadata` can be exported, wrapping the client table.
 *
 * No `PageLayout` here on purpose: `platform/layout.tsx` already supplies the
 * frame (SubMenuPageLayout, Mode B — the sub-menu holds still while this pane
 * scrolls). A second layout would double the padding and the container width.
 */
export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-fg">Audit Logs</h2>
        <p className="mt-0.5 text-fg-subtle">
          Every administrative action, who took it, and what changed. Written inside the same
          transaction as the change itself, and never editable from this console.
        </p>
      </div>

      {/* The provider owns the <Suspense> boundary that useSearchParams() requires. */}
      <ListStateProvider config={AUDIT_LIST} fallback={<AuditTableSkeleton />}>
        <AuditTable />
      </ListStateProvider>
    </div>
  );
}
