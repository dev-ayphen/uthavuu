import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";
import { canReviewReportPhotos } from "@/features/report-photos/permission";
import { REPORT_PHOTOS_LIST, PhotoQueueTable } from "@/features/report-photos/photo-queue-table";
import { PhotoVerificationSummary } from "@/features/report-photos/summary-cards";
import { AccessDeniedState } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";

export const metadata = { title: "Photo Verification" };

/**
 * The photo moderation queue.
 *
 * A Server Component only so it can answer one question the browser must not be
 * trusted with — may this admin review photos — from the session, resolved
 * server-side. The gate is UX, not security: every `/admin/report-photos` route
 * enforces `reports:manage` independently, and this only stops an operator
 * being handed a page of Approve buttons the API will refuse.
 *
 * The subtitle is not filler. A report held here has NO public photo record at
 * all — the `report_photos` relationship is created by the backend, after
 * approval, in a transaction. Saying so once is cheaper than every moderator
 * eventually asking why a pending report looks like it lost its photo.
 */
export default async function Page() {
  const allowed = await canReviewReportPhotos();

  return (
    <PageLayout
      eyebrow="Moderation"
      title="Photo Verification"
      subtitle="Review photos that require human moderation before a report becomes public."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Reports", href: "/reports" },
        { label: "Photo Verification" },
      ]}
      contentWidth="wide"
    >
      {allowed ? (
        <div className="space-y-4">
          <PhotoVerificationSummary />

          <ListStateProvider
            config={REPORT_PHOTOS_LIST}
            fallback={<ListPageSkeleton columns={8} filters={5} />}
          >
            <PhotoQueueTable />
          </ListStateProvider>
        </div>
      ) : (
        <AccessDeniedState {...ACCESS_DENIED.photoVerification} />
      )}
    </PageLayout>
  );
}
