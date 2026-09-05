"use client";

import Link from "next/link";
import { CheckCircle2, Clock, EyeOff, MapPin, MessageSquare } from "lucide-react";

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
  formatRelative,
} from "@/components/data";
import { Alert, Badge, CalloutCard, Card, MetricTile } from "@/components/ui";
import { DetailFallback, useDetailQuery } from "@/features/moderation/detail-query";
import { PendingPhotoBanner } from "@/features/report-photos/pending-photo-banner";
import { commentsForReportHref, userDetailHref } from "@/features/moderation/routes";
import { cn } from "@/lib/cn";
import { ReportActions } from "./report-actions";
import { ReportPhoto } from "./report-photo";
import { ReportStatusBadge } from "./report-status-badge";
import type { AdminReportDetail } from "./types";

const NOT_FOUND_CODES = ["REPORT_NOT_FOUND"] as const;

export function ReportDetail({ reportId }: { reportId: string }) {
  const { view } = useDetailQuery<AdminReportDetail>({
    key: ["admin", "reports", reportId],
    path: `/admin/reports/${encodeURIComponent(reportId)}`,
    notFoundCodes: NOT_FOUND_CODES,
  });

  if (view.kind === "loading") return <DetailSkeleton fields={8} />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="No such report"
        notFoundDescription="This request no longer exists. Hidden reports are still reachable — this one has been removed outright."
        backHref="/reports"
        backLabel="Back to reports"
      />
    );
  }

  const report = view.record;
  const hidden = report.status === "deleted";

  return (
    <DetailBody>
      <DetailHeader
        backHref="/reports"
        backLabel="Back to reports"
        eyebrow={`${report.category.emoji ?? ""} ${report.category.label}`.trim()}
        title={report.title}
        subtitle={
          <span className={cn("text-xs", hidden && "text-fg-faint line-through")}>
            {report.description}
          </span>
        }
        badges={
          <>
            <ReportStatusBadge status={report.status} />
            {report.anonymous ? (
              <Badge tone="neutral" title="Citizens do not see the reporter's name.">
                Anonymous to citizens
              </Badge>
            ) : null}
            {report.phoneVisible ? <Badge tone="info">Phone shared on accept</Badge> : null}
          </>
        }
        actions={<ReportActions report={report} />}
      />

      {/*
        Held by photo verification. The banner says why the Photos section
        below is empty — a `pending_review` report has NO `report_photos` rows,
        by design, until a moderator approves the quarantined image. Rendering
        that absence without explanation reads as data loss.
      */}
      {report.status === "pending_review" ? <PendingPhotoBanner /> : null}

      {hidden ? (
        <CalloutCard tone="danger" icon={EyeOff} title="This report is hidden">
          Removed {formatDate(report.deletedAt, true) ?? "at an unknown time"}
          {report.deletedBy ? ` by ${report.deletedBy.name}` : ""}. Nobody outside the console can
          see it, and neither the reporter nor the volunteers were notified. Everything below is
          preserved so the decision can be reviewed.
        </CalloutCard>
      ) : null}

      {/*
        Status is DERIVED. This panel is the one place the raw column appears,
        because "the database says open, the console says expired" is a fair
        question and its answer should be findable rather than surfaced as
        though the column were the truth. Nothing writes 'expired': the API
        computes it from `expiry_at` at read time.
      */}
      {report.expired ? (
        <Alert tone="warning" icon={Clock}>
          This request passed its window {formatRelative(new Date(report.expiryAt))} and can no
          longer be accepted. The stored status column still reads “{report.storedStatusLabel}” —
          expiry is worked out when the record is read, never written back.
        </Alert>
      ) : null}

      <DetailSection title="At a glance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricTile
            label="Volunteers needed"
            value={report.neededVolunteers}
            icon={CheckCircle2}
            accent="blue"
          />
          <MetricTile
            label="On their way"
            value={report.counts.activeVolunteers}
            icon={CheckCircle2}
            accent="emerald"
          />
          <MetricTile
            label="Ever joined"
            value={report.counts.volunteers}
            icon={CheckCircle2}
            accent="violet"
          />
          <MetricTile
            label="Comments"
            value={report.counts.comments}
            icon={MessageSquare}
            accent="slate"
          />
          <MetricTile label="Saves" value={report.counts.saves} icon={MapPin} accent="cyan" />
        </div>
      </DetailSection>

      <DetailSection title="Request">
        <DetailFields columns={3}>
          <DetailField label="Full description" span={3}>
            <p className={cn("text-sm whitespace-pre-wrap", hidden && "text-fg-faint")}>
              {report.description}
            </p>
          </DetailField>
          <DetailField label="Reporter">
            {report.reporter.id ? (
              <Link
                href={userDetailHref(report.reporter.id)}
                className="inline-flex rounded-control hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PersonCell
                  person={{
                    id: report.reporter.id,
                    name: report.reporter.name,
                    avatarUrl: report.reporter.avatarUrl,
                  }}
                  secondary={report.reporter.phoneNumber}
                />
              </Link>
            ) : (
              <PersonCell person={{ deleted: true }} />
            )}
          </DetailField>
          <DetailField label="Reporter location">
            <MutedCell
              value={
                [report.reporter.city, report.reporter.district].filter(Boolean).join(" · ") || null
              }
            />
          </DetailField>
          <DetailField label="Landmark">
            <MutedCell value={report.location.landmark} />
          </DetailField>
          <DetailField label="Coordinates">
            <span className="tabular text-xs text-fg-subtle">
              {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
            </span>
          </DetailField>
          <DetailField label="Filed">
            <span className="tabular">{formatDate(report.createdAt, true) ?? "—"}</span>
          </DetailField>
          <DetailField label="Expires">
            <span className="tabular">{formatDate(report.expiryAt, true) ?? "—"}</span>
          </DetailField>
          <DetailField label="Closed">
            <MutedCell value={formatDate(report.closedAt, true)} />
          </DetailField>
          <DetailField label="Stored status column">
            {/* Labelled as the raw value, deliberately, so nobody mistakes it
                for the status the rest of the console shows. */}
            <span className="text-xs text-fg-subtle">
              <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                {report.storedStatus}
              </code>
              {report.storedStatus !== report.status ? (
                <span className="ml-2 text-fg-faint">
                  effective status is “{report.status}”
                </span>
              ) : null}
            </span>
          </DetailField>
          <DetailField label="Report id">
            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {report.id}
            </code>
          </DetailField>
        </DetailFields>
      </DetailSection>

      {report.photos.length > 0 ? (
        <DetailSection title={`Photos (${report.photos.length})`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {report.photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="group relative block overflow-hidden rounded-card border border-border bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <ReportPhoto
                  url={photo.url}
                  sizes="(min-width: 1024px) 20vw, (min-width: 640px) 30vw, 45vw"
                  className="transition-transform group-hover:scale-[1.02]"
                />
              </a>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection
        title="Volunteer roster"
        description="Everyone who has ever joined this mission, oldest first, with how far they got."
      >
        {report.volunteers.length === 0 ? (
          <Card>
            <p className="p-4 text-xs text-fg-faint">Nobody has accepted this request.</p>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {report.volunteers.map((volunteer) => (
                <li
                  key={volunteer.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    {volunteer.userId ? (
                      <Link
                        href={userDetailHref(volunteer.userId)}
                        className="inline-flex rounded-control hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <PersonCell
                          person={{
                            id: volunteer.userId,
                            name: volunteer.name,
                            avatarUrl: volunteer.avatarUrl,
                          }}
                          secondary={volunteer.phoneNumber}
                        />
                      </Link>
                    ) : (
                      <PersonCell person={{ deleted: true }} />
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-fg-faint">
                    <span className="tabular">Joined {formatDate(volunteer.joinedAt, true)}</span>
                    {volunteer.progress ? (
                      <Badge tone="neutral">{volunteer.progress}</Badge>
                    ) : null}
                    <Badge tone={volunteerTone(volunteer.status.key)}>
                      {volunteer.status.label}
                    </Badge>
                  </div>

                  {volunteer.releaseReason ? (
                    <p className="w-full text-[11px] text-fg-faint">
                      Released: {volunteer.releaseReason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </DetailSection>

      {report.completion ? (
        <DetailSection title="Completion" description="What the volunteer submitted as proof.">
          <Card>
            <div className="flex flex-wrap gap-4 p-4">
              {report.completion.photoUrl ? (
                <span className="w-64 shrink-0 overflow-hidden rounded-card border border-border">
                  <ReportPhoto
                    url={report.completion.photoUrl}
                    sizes="(min-width: 640px) 16rem, 100vw"
                  />
                </span>
              ) : null}
              <dl className="min-w-0 flex-1 space-y-3">
                <div>
                  <dt className="micro-label">Status</dt>
                  <dd className="mt-1">
                    <Badge tone={report.completion.verifiedAt ? "success" : "warning"}>
                      {report.completion.status}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="micro-label">Submitted by</dt>
                  <dd className="mt-1 text-fg">
                    {report.completion.completedBy?.name ?? "Deleted account"} ·{" "}
                    <span className="tabular text-fg-subtle">
                      {formatDate(report.completion.submittedAt, true)}
                    </span>
                  </dd>
                </div>
                {report.completion.note ? (
                  <div>
                    <dt className="micro-label">Note</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-fg">{report.completion.note}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </Card>
        </DetailSection>
      ) : null}

      {/*
        ==========================================================================
        MISSION CHAT IS NOT HERE, AND MUST NOT BE ADDED.
        ==========================================================================
        `GET /admin/reports/:id` returns photos, the volunteer roster and the
        completion. It does not return `mission_messages`, and no admin endpoint
        does. That is a product decision, not a gap: the private thread between
        a reporter and the volunteers who accepted is gated server-side on
        `hasAccepted`, the same gate that controls the phone-number reveal, and
        the owner decided admins never read it.

        Deliberately absent, too, is a "chat coming soon" placeholder — a
        placeholder is a promise, and this one would be a promise to break a
        privacy guarantee. The public Community Comments on this report ARE
        moderatable, and that is what the link below goes to.
      */}
      <DetailSection
        title="Community comments"
        description="The public conversation on this report. The private mission thread between the reporter and their volunteers is not visible to the console."
      >
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-xs text-fg-subtle">
              {report.counts.comments === 0
                ? "No comments on this report."
                : `${report.counts.comments} public ${
                    report.counts.comments === 1 ? "comment" : "comments"
                  }.`}
            </p>
            <Link
              href={commentsForReportHref(report.id)}
              className="rounded-control text-xs font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open in Comments
            </Link>
          </div>
        </Card>
      </DetailSection>
    </DetailBody>
  );
}

function volunteerTone(key: string): "success" | "info" | "neutral" {
  if (key === "active") return "success";
  if (key === "joined") return "info";
  return "neutral";
}
