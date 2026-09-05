"use client";

import Link from "next/link";
import { EyeOff, MapPin } from "lucide-react";

import {
  DetailBody,
  DetailField,
  DetailFields,
  DetailHeader,
  DetailSection,
  DetailSkeleton,
  MutedCell,
  PersonCell,
  formatDate,
} from "@/components/data";
import { Badge, CalloutCard, Card } from "@/components/ui";
import { DetailFallback, useDetailQuery } from "@/features/moderation/detail-query";
import { reportDetailHref, userDetailHref } from "@/features/moderation/routes";
import { ReportStatusBadge } from "@/features/reports/report-status-badge";
import { PhotoReviewActions } from "./photo-review-actions";
import { PrivatePhoto, QuarantineNote } from "./private-photo";
import { photoStateCopy } from "./reason-copy";
import type { ReportPhotoDetail } from "./types";
import { VerificationPanel } from "./verification-panel";
import { formatBytes, photoStatusRef, reportContextOf } from "./wire";

const NOT_FOUND_CODES = ["PHOTO_NOT_FOUND"] as const;

/**
 * One held photo, in full: the photograph, the report it belongs to, what the
 * file is, and both verdicts.
 *
 * Fetched client-side (not in the Server Component above it) so that a decision
 * can invalidate and re-render this page in place — the same arrangement
 * `ReportDetail` uses for close / hide / reinstate.
 *
 * THE PHOTO COMES FROM THE ADMIN-ONLY ROUTE. There is no public URL to fall
 * back to and there must never be one: a held photo has no `report_photos` row,
 * so anything under `/uploads/**` would either 404 or — much worse — imply the
 * photograph is already visible to citizens. See `private-photo.tsx`.
 */
export function PhotoDetail({ photoId }: { photoId: string }) {
  const { view } = useDetailQuery<ReportPhotoDetail>({
    key: ["admin", "report-photos", photoId],
    path: `/admin/report-photos/${encodeURIComponent(photoId)}`,
    notFoundCodes: NOT_FOUND_CODES,
  });

  if (view.kind === "loading") return <DetailSkeleton fields={8} />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="No such photo"
        notFoundDescription="This verification record no longer exists. The row survives its file, so a deletion here means the record itself was removed."
        backHref="/reports/photo-verification"
        backLabel="Back to the queue"
      />
    );
  }

  const photo = view.record;
  // `photoStateCopy`, not the raw lookup label: the API's word for `failed`
  // is "Verification failed", and on a page headed by a photograph that reads
  // as a verdict on the photograph rather than on the check. See reason-copy.ts.
  const state = photoStateCopy(photoStatusRef(photo.verificationStatus));
  const context = reportContextOf(photo);
  const decided = photo.reviewedAt !== null;

  return (
    <DetailBody>
      <DetailHeader
        backHref="/reports/photo-verification"
        backLabel="Back to the queue"
        eyebrow="Photo verification"
        title={context?.title ?? "Photo awaiting a report"}
        subtitle={
          <span className="text-xs">
            Submitted {formatDate(photo.createdAt, true) ?? "at an unknown time"}
          </span>
        }
        badges={
          <>
            {state ? <Badge tone={state.tone}>{state.label}</Badge> : null}
            {photo.reportStatus ? <ReportStatusBadge status={photo.reportStatus} /> : null}
          </>
        }
        // Still offered after a decision: the API is the authority on whether a
        // second one is legal, and it answers PHOTO_ALREADY_REVIEWED with a 409
        // that the dialog turns into "someone else already decided" plus a
        // refetch. Hiding the buttons on a stale row would be this console
        // guessing at a rule it does not own.
        actions={<PhotoReviewActions photo={photo} />}
      />

      {decided ? (
        <CalloutCard tone="neutral" icon={EyeOff} title="This photo has already been decided">
          {photo.reviewedBy?.name ?? "A moderator"} decided on{" "}
          {formatDate(photo.reviewedAt, true) ?? "an unknown date"}. Acting again will be refused
          unless the API allows a second decision — and if it does, this page will show whatever it
          returns, not what was clicked.
        </CalloutCard>
      ) : null}

      <DetailSection
        title="The photograph"
        description="Loaded from the admin-only file route. It is not public and has no citizen-visible URL."
      >
        <Card className="overflow-hidden">
          <div className="bg-surface-inset">
            <PrivatePhoto photoId={photo.id} label="Held photo" className="max-h-[32rem]" />
          </div>
          <div className="p-4">
            <QuarantineNote />
          </div>
        </Card>
      </DetailSection>

      <DetailSection
        title="Report information"
        description={
          context
            ? "The request this photograph was submitted for."
            : "Verification happens before a report exists, so a photo can legitimately have none yet."
        }
      >
        {context ? (
          <DetailFields columns={3}>
            <DetailField label="Title" span={3}>
              {photo.reportId ? (
                <Link
                  href={reportDetailHref(photo.reportId)}
                  className="rounded-control font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {context.title ?? "Open the report"}
                </Link>
              ) : (
                <MutedCell value={context.title} />
              )}
            </DetailField>

            <DetailField label="Description" span={3}>
              {context.description ? (
                <p className="text-sm whitespace-pre-wrap">{context.description}</p>
              ) : (
                <MutedCell value={null} />
              )}
            </DetailField>

            <DetailField label="Category">
              <MutedCell
                value={
                  photo.categoryLabel ??
                  // The category is stored on the upload because it was an INPUT
                  // to the verdict — relevance was judged against it. If the
                  // reporter later switches category, the recorded verdict still
                  // says what it was actually judged on.
                  photo.categoryKey
                }
              />
            </DetailField>

            <DetailField label="Reporter">
              {context.reporter?.id ? (
                <Link
                  href={userDetailHref(context.reporter.id)}
                  className="inline-flex rounded-control hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PersonCell person={{ id: context.reporter.id, name: context.reporter.name }} />
                </Link>
              ) : (
                <PersonCell person={{ deleted: true }} />
              )}
            </DetailField>

            <DetailField label="Report filed">
              <span className="tabular">{formatDate(context.createdAt, true) ?? "—"}</span>
            </DetailField>

            <DetailField label="Landmark">
              <MutedCell value={context.landmark} />
            </DetailField>

            <DetailField label="Coordinates">
              {context.lat !== null && context.lng !== null ? (
                <span className="tabular flex items-center gap-1.5 text-xs text-fg-subtle">
                  <MapPin aria-hidden className="size-3 text-fg-faint" />
                  {context.lat.toFixed(5)}, {context.lng.toFixed(5)}
                </span>
              ) : (
                <MutedCell value={null} />
              )}
            </DetailField>

            <DetailField label="Report status">
              {photo.reportStatus ? (
                <ReportStatusBadge status={photo.reportStatus} />
              ) : (
                <MutedCell value={null} />
              )}
            </DetailField>
          </DetailFields>
        ) : (
          <Card>
            <p className="p-4 text-xs text-fg-subtle">
              This photo is not attached to a report. That is the gate working, not data missing —
              a photograph is verified before the report is created, so there is a window in which
              the verdict exists and the report does not.
            </p>
          </Card>
        )}
      </DetailSection>

      <DetailSection
        title="Photo information"
        description="What the file is. The hashes are how duplicates are found — never render them as an identity."
      >
        <DetailFields columns={3}>
          <DetailField label="Dimensions">
            <span className="tabular">
              {photo.width !== null && photo.height !== null ? (
                `${photo.width} × ${photo.height}`
              ) : (
                <MutedCell value={null} />
              )}
            </span>
          </DetailField>
          <DetailField label="File size">
            <span className="tabular">
              <MutedCell value={formatBytes(photo.byteSize)} />
            </span>
          </DetailField>
          <DetailField label="Type">
            <MutedCell value={photo.mimeType} />
          </DetailField>
          <DetailField label="Submitted">
            <span className="tabular">{formatDate(photo.createdAt, true) ?? "—"}</span>
          </DetailField>
          <DetailField label="Verified">
            <span className="tabular">
              <MutedCell value={formatDate(photo.verifiedAt, true)} />
            </span>
          </DetailField>
          <DetailField label="Photo id">
            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {photo.id}
            </code>
          </DetailField>
          <DetailField label="SHA-256" span={2}>
            {/* Exact-duplicate signal. Shown in full because the useful thing to
                do with it is grep the uploads table, not eyeball it. */}
            <code className="block truncate rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {photo.sha256 ?? "—"}
            </code>
          </DetailField>
          <DetailField label="Perceptual hash">
            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {photo.phash ?? "—"}
            </code>
          </DetailField>
        </DetailFields>
      </DetailSection>

      <VerificationPanel photo={photo} />
    </DetailBody>
  );
}
