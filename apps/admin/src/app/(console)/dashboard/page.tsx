"use client";

import {
  Activity,
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
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  MetricTile,
  Skeleton,
  StatCard,
} from "@/components/ui";
import {
  formatCount,
  useDashboardSummary,
} from "@/features/dashboard/use-dashboard-summary";

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useDashboardSummary();

  return (
    <PageLayout
      eyebrow="Overview"
      title="Dashboard"
      subtitle="Live activity across the community — requests, missions and moderation."
      breadcrumb={[{ label: "Console" }, { label: "Dashboard" }]}
      contentWidth="wide"
      actions={
        data ? (
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
        <DashboardSkeleton />
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
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total platform users"
              value={data.totals.users}
              sublabel="Registered community members"
              icon={Users}
              accent="blue"
            />
            <StatCard
              label="Reports today"
              value={data.totals.reportsToday}
              sublabel="Help requests raised in the last 24h"
                            icon={Megaphone}
              accent="amber"
            />
            <StatCard
              label="Active missions"
              value={data.totals.activeMissions}
              sublabel="Currently being helped"
              icon={HandHeart}
              accent="violet"
            />
            <StatCard
              label="Completed today"
              value={data.totals.completedToday}
              sublabel="Missions resolved"
                            icon={CheckCircle2}
              accent="emerald"
            />
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <MetricTile label="Active users" value={formatCount(data.counters.activeUsers)} icon={UserCheck} accent="emerald" />
            <MetricTile label="Critical open" value={formatCount(data.counters.criticalOpen)} icon={AlertTriangle} accent="rose" />
            <MetricTile label="Fake reports" value={formatCount(data.counters.fakeReports)} icon={Flag} accent="rose" />
            <MetricTile label="Pending review" value={formatCount(data.counters.pendingReview)} icon={ShieldAlert} accent="amber" />
            <MetricTile label="Helps given" value={formatCount(data.counters.helpsGiven)} icon={Award} accent="cyan" />
            <MetricTile label="Field updates" value={formatCount(data.counters.fieldUpdates)} icon={MessageCircle} accent="violet" />
            <MetricTile label="Comments today" value={formatCount(data.counters.commentsToday)} icon={MessageSquare} accent="pink" />
            <MetricTile label="Impact stories" value={formatCount(data.counters.impactStories)} icon={Star} accent="amber" />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Activity className="size-4 text-primary" />
                  Live activity
                </CardTitle>
              </CardHeader>
              <CardBody>
                <p className="py-6 text-center text-fg-faint">Activity feed isn&apos;t wired to an endpoint yet.</p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <AlertTriangle className="size-4 text-danger-fg" />
                  Urgent requests
                </CardTitle>
              </CardHeader>
              <CardBody>
                <p className="py-6 text-center text-fg-faint">Urgent requests aren&apos;t wired to an endpoint yet.</p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Flag className="size-4 text-danger-fg" />
                  Latest flagged reports
                </CardTitle>
              </CardHeader>
              <CardBody>
                <p className="py-6 text-center text-fg-faint">Flagged reports aren&apos;t tracked yet.</p>
              </CardBody>
            </Card>
          </section>
        </div>
      )}
    </PageLayout>
  );
}

/** Mirrors the loaded layout exactly, so nothing shifts when data lands. */
function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.75rem] rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-card" />
        ))}
      </div>
    </div>
  );
}
