import { AccessDeniedState } from "@/components/ui";
import { PageLayout } from "@/components/layout";
import { PhotoDetail } from "@/features/report-photos/photo-detail";
import { canReviewReportPhotos } from "@/features/report-photos/permission";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";

export const metadata = { title: "Photo Verification" };

/**
 * One held photo, in full.
 *
 * A Server Component so it can await `params` and resolve the permission mirror
 * from the session; the record itself is fetched client-side by `PhotoDetail`,
 * so approve / reject / request-new can invalidate and re-render in place.
 *
 * `contentWidth="wide"` rather than the detail default: the photograph is the
 * point of this page and it needs room, and the verification panel puts the
 * signal bands three across.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, allowed] = await Promise.all([params, canReviewReportPhotos()]);

  return (
    <PageLayout
      eyebrow="Moderation"
      title="Photo Verification"
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Reports", href: "/reports" },
        { label: "Photo Verification", href: "/reports/photo-verification" },
        { label: "Photo" },
      ]}
      contentWidth="wide"
    >
      {allowed ? (
        <PhotoDetail photoId={id} />
      ) : (
        <AccessDeniedState {...ACCESS_DENIED.photoVerification} />
      )}
    </PageLayout>
  );
}
