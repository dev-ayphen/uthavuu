import { ListStateProvider } from "@/components/data";
import { SUPPORT_LIST } from "@/features/support-tickets/use-support-tickets";
import { SupportTable, SupportTableSkeleton } from "@/features/support-tickets/support-table";

export const metadata = { title: "Support" };

/** Frame comes from `platform/layout.tsx` (SubMenuPageLayout, Mode B scroll). */
export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-fg">Support</h2>
        <p className="mt-0.5 text-fg-subtle">
          Feedback, bug reports and account problems raised from the mobile app.
        </p>
      </div>

      <ListStateProvider config={SUPPORT_LIST} fallback={<SupportTableSkeleton />}>
        <SupportTable />
      </ListStateProvider>
    </div>
  );
}
