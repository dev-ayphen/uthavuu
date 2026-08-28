import { PageLayout } from "@/components/layout";
import { ReportDetail } from "@/features/reports/report-detail";

export const metadata = { title: "Report" };

/**
 * One help request, in full.
 *
 * Server component only to await `params`; the record is fetched client-side by
 * `ReportDetail` so close / reopen / hide / reinstate can invalidate and
 * re-render in place.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PageLayout
      eyebrow="Moderation"
      title="Report"
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Reports", href: "/reports" },
        { label: "Report" },
      ]}
      contentWidth="default"
    >
      <ReportDetail reportId={id} />
    </PageLayout>
  );
}
