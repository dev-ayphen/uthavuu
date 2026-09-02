"use client";

import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Flag,
  HandHeart,
  Inbox,
  Megaphone,
  MessageCircle,
  MessageSquare,
  ShieldAlert,
  Star,
  UserCheck,
  Users,
} from "lucide-react";

import { PageLayout } from "@/components/layout";
import { Badge, EmptyState, ErrorState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ActivityFeed } from "./activity-feed";
import { CounterTile, StatTile } from "./counter-tile";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { FlaggedCommentsPanel } from "./flagged-comments-panel";
import { UrgentRequests } from "./urgent-requests";
import { useDashboardSummary } from "./use-dashboard-summary";

/**
 * The console's landing page.
 *
 * A client component because every figure on it is server state read through
 * React Query. The permission answers it needs are NOT client state, so they
 * arrive as props from the segment's Server Component (`page.tsx`), resolved
 * from the session — never from a URL, never from a role guessed in the
 * browser. See features/dashboard/permission.ts.
 *
 * THREE INDEPENDENT REQUESTS, THREE INDEPENDENT FAILURES
 * ───────────────────────────────────────────────────────────────────────────
 * The counters, the activity feed and each side panel fetch separately and own
 * their own loading / error / empty states. That is the point: a 500 on the
 * flagged-comments queue must not blank the urgent requests beside it, and
 * neither may blank the counters above them. Nothing here lifts a panel's
 * failure into the page.
 */
export function DashboardView({
  canSeeUrgentRequests,
  canSeeFlaggedComments,
}: {
  /** Mirrors `reports:manage`, which `GET /admin/reports` enforces. */
  canSeeUrgentRequests: boolean;
  /** Mirrors `comments:manage`, which `GET /admin/flagged-comments` enforces. */
  canSeeFlaggedComments: boolean;
}) {
  const { data, isLoading, isError, error, refetch } = useDashboardSummary();

  // A panel this admin cannot use is not rendered at all — rendering it would
  // guarantee a 403 and fill the card with "you don't have permission", which
  // reads as a broken console rather than as a boundary working correctly.
  const sidePanels: 0 | 1 | 2 =
    canSeeUrgentRequests && canSeeFlaggedComments
      ? 2
      : canSeeUrgentRequests || canSeeFlaggedComments
        ? 1
        : 0;

  return (
    <PageLayout
      eyebrow="Overview"
      title="Dashboard"
      subtitle="Live activity across the community — requests, missions and moderation."
      breadcrumb={[{ label: "Console" }, { label: "Dashboard" }]}
      contentWidth="wide"
      actions={
        // Without the zone, "today" is not a figure anyone can act on: a report
        // filed at 00:30 IST counts today here and yesterday in UTC.
        data?.timeZone ? (
          <Badge tone="neutral" title={`Counted in ${data.timeZone}`}>
            {data.timeZone}
          </Badge>
        ) : null
      }
    >
      {/*
        BRANCH ORDER IS LOAD-BEARING: loading -> error -> empty -> content.
        Checking `empty` before `isError` would render "nothing here yet" when
        the request actually failed — telling the operator their data is gone
        when it is the network that is gone.
      */}
      {isLoading ? (
        <DashboardSkeleton sidePanels={sidePanels} />
      ) : isError ? (
        <ErrorState
          title="Couldn't load the dashboard"
          message={error?.message ?? "The console couldn't reach the API."}
          onRetry={refetch}
        />
      ) : !data ? (
        <EmptyState
          icon={<Inbox className="size-10" />}
          title="No activity yet"
          description="Once the community starts posting requests, they'll show up here."
        />
      ) : (
        <div className="space-y-4">
          {/*
            Every number below comes from `GET /admin/dashboard`. A tile the API
            has no source for renders an em dash and explains itself on hover —
            never a 0, which an operator reads as "checked, nothing to do".
          */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Total platform users"
              counter={data.totals.users}
              sublabel="Registered community members"
              icon={Users}
              accent="blue"
            />
            <StatTile
              label="Reports today"
              counter={data.totals.reportsToday}
              sublabel="Help requests raised in the last 24h"
              icon={Megaphone}
              accent="amber"
            />
            <StatTile
              label="Active missions"
              counter={data.totals.activeMissions}
              sublabel="Currently being helped"
              icon={HandHeart}
              accent="violet"
            />
            <StatTile
              label="Completed today"
              counter={data.totals.completedToday}
              sublabel="Missions resolved"
              icon={CheckCircle2}
              accent="emerald"
            />
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <CounterTile
              label="Active users"
              counter={data.counters.activeUsers}
              icon={UserCheck}
              accent="emerald"
            />
            {/* The same 15-minute window the "Urgent requests" panel below
                lists row by row — one number, one list, one definition. */}
            <CounterTile
              label="Critical open"
              counter={data.counters.criticalOpen}
              icon={AlertTriangle}
              accent="rose"
            />
            {/* Permanently blank: nothing in Uthavu flags a report. The tile's
                note says so, so the em dash stops reading as a bug. */}
            <CounterTile
              label="Fake reports"
              counter={data.counters.fakeReports}
              icon={Flag}
              accent="rose"
            />
            <CounterTile
              label="Pending review"
              counter={data.counters.pendingReview}
              icon={ShieldAlert}
              accent="amber"
            />
            <CounterTile
              label="Helps given"
              counter={data.counters.helpsGiven}
              icon={Award}
              accent="cyan"
            />
            <CounterTile
              label="Field updates"
              counter={data.counters.fieldUpdates}
              icon={MessageCircle}
              accent="violet"
            />
            <CounterTile
              label="Comments today"
              counter={data.counters.commentsToday}
              icon={MessageSquare}
              accent="pink"
            />
            <CounterTile
              label="Impact stories"
              counter={data.counters.impactStories}
              icon={Star}
              accent="amber"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {/* Two columns: a row is "<who> <did what> <to what> <when>", and
                at a third of a wide page every one of those four would truncate.
                With neither side panel visible it takes the full width rather
                than leaving an empty column where a gated panel would have been. */}
            <ActivityFeed className={cn(sidePanels === 0 ? "lg:col-span-3" : "lg:col-span-2")} />

            {sidePanels > 0 ? (
              <div className="grid content-start gap-4">
                {canSeeUrgentRequests ? <UrgentRequests /> : null}
                {canSeeFlaggedComments ? <FlaggedCommentsPanel /> : null}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </PageLayout>
  );
}
