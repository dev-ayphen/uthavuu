"use client";

import Link from "next/link";
import { Ban, HandHeart, MessageSquare, Megaphone } from "lucide-react";

import {
  DetailBody,
  DetailField,
  DetailFields,
  DetailHeader,
  DetailSection,
  DetailSkeleton,
  MutedCell,
  formatDate,
} from "@/components/data";
import { Badge, Card, MetricTile } from "@/components/ui";
import { DetailFallback, useDetailQuery } from "@/features/moderation/detail-query";
import {
  reportDetailHref,
  reportsByReporterHref,
} from "@/features/moderation/routes";
import { ReportStatusBadge } from "@/features/reports/report-status-badge";
import type { AdminUserDetail } from "./types";
import { ContentStaysVisibleNote, UserStatusActions } from "./user-status-actions";
import { UserStatusBadge } from "./user-status-badge";

const NOT_FOUND_CODES = ["USER_NOT_FOUND"] as const;

export function UserDetail({ userId }: { userId: string }) {
  const { view } = useDetailQuery<AdminUserDetail>({
    key: ["admin", "users", userId],
    path: `/admin/users/${encodeURIComponent(userId)}`,
    notFoundCodes: NOT_FOUND_CODES,
  });

  if (view.kind === "loading") return <DetailSkeleton fields={8} />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="No such account"
        notFoundDescription="This member no longer exists. The link may be from before the account was deleted."
        backHref="/users"
        backLabel="Back to members"
      />
    );
  }

  const user = view.record;
  const suspended = user.status.key === "suspended";

  return (
    <DetailBody>
      <DetailHeader
        backHref="/users"
        backLabel="Back to members"
        eyebrow={user.isStaff ? "Console staff" : "Community member"}
        title={user.name}
        subtitle={
          <span className="text-xs">
            {user.phoneNumber ?? "No phone on file"}
            {user.phoneNumberVerified ? " · verified" : " · unverified"}
          </span>
        }
        badges={
          <UserStatusBadge status={user.status} isStaff={user.isStaff} role={user.adminRole} />
        }
        actions={<UserStatusActions user={user} />}
      />

      {/*
        The suspension panel is not decoration. Product rule: suspension blocks
        login and leaves content up. An admin looking at a suspended account
        needs four facts in one place — that it IS suspended, why, when, and who
        did it — plus the reassurance that the person's reports are still on the
        platform, because the obvious assumption is the opposite.
      */}
      {suspended ? (
        <Card className="border-danger-soft-border">
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-control bg-danger-soft text-danger-fg">
                <Ban className="size-3.5" aria-hidden />
              </span>
              <h3 className="text-sm font-bold text-fg">This account is suspended</h3>
            </div>

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <dt className="micro-label">Reason</dt>
                <dd className="mt-1 text-fg">
                  {user.status.reason ?? <span className="text-fg-faint">No reason recorded</span>}
                </dd>
              </div>
              <div>
                <dt className="micro-label">Suspended</dt>
                <dd className="tabular mt-1 text-fg">
                  {formatDate(user.status.suspendedAt, true) ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="micro-label">By</dt>
                <dd className="mt-1 text-fg">
                  {user.status.suspendedBy?.name ?? (
                    <span className="text-fg-faint">Unknown</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="micro-label">Status key</dt>
                <dd className="mt-1">
                  <Badge tone="danger">{user.status.label}</Badge>
                </dd>
              </div>
            </dl>

            <ContentStaysVisibleNote />
          </div>
        </Card>
      ) : null}

      <DetailSection
        title="Activity"
        description="Everything this member has done on the platform."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile
            label="Reports filed"
            value={user.counts.reports.total}
            icon={Megaphone}
            accent="blue"
          />
          <MetricTile
            label="Open now"
            value={user.counts.reports.open}
            icon={Megaphone}
            accent="emerald"
          />
          <MetricTile
            label="Expired"
            value={user.counts.reports.expired}
            icon={Megaphone}
            accent="amber"
          />
          <MetricTile
            label="Missions joined"
            value={user.counts.missions.total}
            icon={HandHeart}
            accent="violet"
          />
          <MetricTile
            label="Helps completed"
            value={user.counts.completions}
            icon={HandHeart}
            accent="emerald"
          />
          <MetricTile
            label="Comments"
            value={user.counts.comments}
            icon={MessageSquare}
            accent="slate"
          />
        </div>
      </DetailSection>

      <DetailSection title="Account">
        <DetailFields columns={3}>
          <DetailField label="Member id">
            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {user.id}
            </code>
          </DetailField>
          <DetailField label="Phone">
            <MutedCell value={user.phoneNumber} />
          </DetailField>
          <DetailField label="Contact email">
            <MutedCell value={user.contactEmail} />
          </DetailField>
          <DetailField label="City">
            <MutedCell value={user.city} />
          </DetailField>
          <DetailField label="District">
            <MutedCell value={user.district} />
          </DetailField>
          <DetailField label="Language">
            <MutedCell value={user.language ?? user.locale} />
          </DetailField>
          <DetailField label="Profession">
            <MutedCell
              value={
                user.profession
                  ? user.showProfession
                    ? user.profession
                    : `${user.profession} (hidden on their profile)`
                  : null
              }
            />
          </DetailField>
          <DetailField label="Organization">
            <MutedCell value={user.organization} />
          </DetailField>
          <DetailField label="Alert radius">
            <MutedCell value={user.preferredRadius ? `${user.preferredRadius} km` : null} />
          </DetailField>
          <DetailField label="Profile setup">
            {user.profileCompleted ? (
              <span className="text-fg">
                Completed {formatDate(user.profileCompletedAt) ?? ""}
              </span>
            ) : (
              <span className="text-warning-fg">Never finished</span>
            )}
          </DetailField>
          <DetailField label="Joined">
            <span className="tabular">{formatDate(user.createdAt, true) ?? "—"}</span>
          </DetailField>
          <DetailField label="Posts anonymously by default">
            <MutedCell value={user.privacyDefaults.anonymous ? "Yes" : "No"} />
          </DetailField>
        </DetailFields>
      </DetailSection>

      <DetailSection
        title="Recent reports"
        description="The ten most recent, newest first. Status is the effective one, not the stored column."
        actions={
          user.counts.reports.total > 0 ? (
            <Link
              href={reportsByReporterHref(user.id)}
              className="rounded-control text-[11px] font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              All {user.counts.reports.total} reports
            </Link>
          ) : null
        }
      >
        {user.recentReports.length === 0 ? (
          <Card>
            <p className="p-4 text-xs text-fg-faint">This member has never filed a report.</p>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {user.recentReports.map((report) => (
                <li key={report.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link
                    href={reportDetailHref(report.id)}
                    className="min-w-0 flex-1 rounded-control text-xs font-medium text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate">
                      {report.category.emoji ? `${report.category.emoji} ` : ""}
                      {report.title}
                    </span>
                  </Link>
                  <span className="tabular shrink-0 text-[11px] text-fg-faint">
                    {formatDate(report.createdAt)}
                  </span>
                  <ReportStatusBadge status={report.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </DetailSection>

      <DetailSection
        title="Missions volunteered for"
        description="Where this member stepped in to help someone else."
      >
        {user.recentMissions.length === 0 ? (
          <Card>
            <p className="p-4 text-xs text-fg-faint">
              This member has never volunteered for a mission.
            </p>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {user.recentMissions.map((mission) => (
                <li
                  key={mission.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <Link
                    href={reportDetailHref(mission.reportId)}
                    className="min-w-0 flex-1 rounded-control text-xs font-medium text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate">{mission.reportTitle}</span>
                  </Link>
                  <span className="tabular shrink-0 text-[11px] text-fg-faint">
                    {formatDate(mission.joinedAt)}
                  </span>
                  <Badge tone={mission.volunteerStatus === "released" ? "neutral" : "info"}>
                    {mission.volunteerStatus}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </DetailSection>
    </DetailBody>
  );
}
