import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";
import { REPORTS_LIST, ReportsTable } from "@/features/reports/reports-table";

export const metadata = { title: "All Reports" };

/**
 * The moderation queue.
 *
 * The subtitle is not filler: every status shown on this page is DERIVED by the
 * API from `expiry_at`, because nothing in the codebase ever writes 'expired'.
 * Saying so once, here, is cheaper than every operator eventually asking why
 * the console and the database disagree.
 */
export default function Page() {
  return (
    <PageLayout
      eyebrow="Moderation"
      title="All Reports"
      subtitle="Every help request across Tamil Nadu, newest first. Status is worked out when the record is read, so an expired request shows as expired."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Reports" }]}
      contentWidth="wide"
    >
      <ListStateProvider config={REPORTS_LIST} fallback={<ListPageSkeleton columns={8} filters={3} />}>
        <ReportsTable />
      </ListStateProvider>
    </PageLayout>
  );
}
