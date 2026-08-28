"use client";

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  EyeOff,
  HandHeart,
  Hourglass,
  Lock,
  Megaphone,
  Radio,
  Users,
  UserPlus,
} from "lucide-react";
import { useId } from "react";

import { BarList, ColumnDatumHelpers, REPORT_SERIES, StackedColumnChart } from "./charts";
import { ListFailureState, formatDate, useListState } from "@/components/data";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  MetricTile,
  Select,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { classifyListFailure } from "@/lib/list-failure";
import {
  BUCKET_OPTIONS,
  formatFigure,
  RANGE_OPTIONS,
  useAnalytics,
} from "./use-analytics";

/**
 * Analytics over the report / mission / user tables.
 *
 * THE ONE RULE THIS PAGE IS BUILT AROUND
 * ───────────────────────────────────────────────────────────────────────────
 * A figure the API does not supply renders as an em dash, never as `0`. `0`
 * says "this happened zero times"; the em dash says "we did not measure this".
 * `missions.completionRate` and both response-time percentiles are genuinely
 * nullable — the service returns null rather than dividing by zero or coercing
 * an empty `percentile_cont` — and `formatFigure` keeps that distinction all
 * the way to the pixel.
 *
 * THE SECOND RULE, WHICH IS EASIER TO GET WRONG
 * ───────────────────────────────────────────────────────────────────────────
 * Two of these figures count different populations, and the page says so out
 * loud. `reportsByStatus` counts EVERY report including ones moderators hid
 * (that is what its `deleted` bucket is), while `reportsOverTime` and
 * `reportsByCategory` both filter `deleted_at is null`. Against the live data
 * that is 100 versus 66. Putting "100 reports" above a chart whose columns sum
 * to 66, with no explanation, is how a dashboard teaches people not to trust it.
 */
export function AnalyticsView() {
  const { data, isPending, isError, error, refetch } = useAnalytics();

  // Branch order: loading -> error -> content. The range controls stay mounted
  // through all three, so a permission refusal does not remove the only thing
  // on the page an operator could still interact with.
  return (
    <div className="space-y-4">
      <RangeControls />

      {isPending ? (
        <AnalyticsSkeleton />
      ) : isError ? (
        <ListFailureState failure={classifyListFailure(error)} onRetry={() => void refetch()} />
      ) : (
        <>
          <p className="text-[11px] text-fg-faint">
            {/* The server's echo of the window it actually measured, not the one
                this page asked for. If the two ever disagree, this is where it shows. */}
            Measuring {formatDate(data.range.from)} → {formatDate(data.range.to)}, bucketed by{" "}
            {data.range.bucket}, in {data.range.timeZone}.
          </p>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Community members"
              value={formatFigure(data.userGrowth.totalUsers)}
              sublabel="Registered citizens, staff excluded"
              icon={Users}
              accent="blue"
            />
            <StatCard
              label="Reports created"
              value={formatFigure(data.reportsByStatus.total)}
              sublabel={`In range · includes ${data.reportsByStatus.deleted} hidden by moderators`}
              icon={Megaphone}
              accent="amber"
            />
            <StatCard
              label="Missions started"
              value={formatFigure(data.missions.created)}
              sublabel={`${data.missions.completed} completed`}
              icon={HandHeart}
              accent="violet"
            />
            <StatCard
              label="Mission completion"
              // null (no missions at all) becomes an em dash. A "0%" completion
              // rate would read as total failure rather than as no data.
              value={formatFigure(data.missions.completionRate, "%")}
              sublabel={
                data.missions.completionRate === null
                  ? "No missions started in this range"
                  : "Of missions started in this range"
              }
              icon={CheckCircle2}
              accent="emerald"
            />
          </section>

          <section>
            <h2 className="micro-label mb-2">Where those reports ended up</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <MetricTile label="Still open" value={formatFigure(data.reportsByStatus.open)} icon={Radio} accent="blue" />
              <MetricTile label="Expired" value={formatFigure(data.reportsByStatus.expired)} icon={Hourglass} accent="amber" />
              <MetricTile label="Closed" value={formatFigure(data.reportsByStatus.closed)} icon={Lock} accent="slate" />
              <MetricTile label="Completed" value={formatFigure(data.reportsByStatus.completed)} icon={CheckCircle2} accent="emerald" />
              <MetricTile label="Hidden by mods" value={formatFigure(data.reportsByStatus.deleted)} icon={EyeOff} accent="rose" />
              <MetricTile
                label="New members"
                value={formatFigure(
                  data.userGrowth.buckets.reduce((sum, bucket) => sum + bucket.newUsers, 0),
                )}
                icon={UserPlus}
                accent="cyan"
              />
            </div>
            <p className="mt-2 text-[11px] text-fg-faint">
              Statuses are derived at query time, never read from a stale{" "}
              <code className="font-mono">status_id</code> — a request past its expiry counts as
              expired even if nothing has rewritten its row.
            </p>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>
                  <CalendarClock className="size-4 text-primary" />
                  Reports over time
                </CardTitle>
                <span className="text-[11px] text-fg-faint">Hidden reports excluded</span>
              </CardHeader>
              <CardBody>
                <StackedColumnChart
                  data={data.reportsOverTime.map(ColumnDatumHelpers.fromReportBucket)}
                  series={REPORT_SERIES}
                  emptyMessage="No reports were created in this range."
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Clock3 className="size-4 text-primary" />
                  Time to first helper
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <Percentile
                  label="Median (P50)"
                  value={data.responseTime.firstAcceptP50}
                  unit={data.responseTime.unit}
                />
                <Percentile
                  label="Slowest 10% (P90)"
                  value={data.responseTime.firstAcceptP90}
                  unit={data.responseTime.unit}
                />
                <p className="border-t border-border pt-3 text-[11px] text-fg-faint">
                  {data.responseTime.sampleSize === 0
                    ? "No report in this range has been accepted yet, so there is nothing to take a percentile of — which is why these read as em dashes rather than zero."
                    : `From ${data.responseTime.sampleSize} accepted report${
                        data.responseTime.sampleSize === 1 ? "" : "s"
                      }. Measured to the FIRST volunteer who joined — a later joiner is a second responder, not a slower response. Percentiles, not an average: one request left for three days would drag a mean away from what anyone actually experienced.`}
                </p>
              </CardBody>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>What people ask for</CardTitle>
                <span className="text-[11px] text-fg-faint">Hidden reports excluded</span>
              </CardHeader>
              <CardBody>
                <BarList
                  valueLabel="reports"
                  emptyMessage="No reports were created in this range."
                  data={data.reportsByCategory.map((category) => ({
                    key: category.key,
                    label: (
                      <>
                        <span role="img" aria-label={`${category.label} icon`}>
                          {category.emoji}
                        </span>{" "}
                        {category.label}
                      </>
                    ),
                    value: category.total,
                    detail: `${category.completed} completed · ${category.expired} expired · ${category.open} open`,
                  }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where they come from</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <BarList
                  valueLabel="reports"
                  emptyMessage="No reporter in this range has a district on their profile."
                  data={data.geography.topDistricts.map((district, index) => ({
                    key: district.district ?? `unknown-${index}`,
                    // The query filters out null districts, so this branch should
                    // not fire — but the column is nullable, and "—" beats "null".
                    label: district.district ?? "District not set",
                    value: district.reports,
                  }))}
                />
                {/* The API ships this caveat IN the payload rather than leaving it
                    to a comment, precisely so the console cannot quietly drop it. */}
                <p className="border-t border-border pt-3 text-[11px] text-fg-faint">
                  {data.geography.caveat}
                </p>
              </CardBody>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

/** Range and bucket, both URL-backed. See the note in `use-analytics.ts`. */
function RangeControls() {
  const { params, setFilter } = useListState();
  const rangeId = useId();
  const bucketId = useId();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <label htmlFor={rangeId} className="micro-label whitespace-nowrap">
          Range
        </label>
        <Select
          id={rangeId}
          size="sm"
          className="w-auto"
          value={params.filters.range ?? "30d"}
          onChange={(event) => setFilter("range", event.target.value)}
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <label htmlFor={bucketId} className="micro-label whitespace-nowrap">
          Group by
        </label>
        <Select
          id={bucketId}
          size="sm"
          className="w-auto"
          value={params.filters.bucket ?? "day"}
          onChange={(event) => setFilter("bucket", event.target.value)}
        >
          {BUCKET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** A percentile, or an honest em dash when the sample was empty. */
function Percentile({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div>
      <p className="micro-label">{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold text-fg">
        {value === null ? (
          <span className="text-fg-faint" title="No accepted reports to measure.">
            —
          </span>
        ) : (
          <>
            {formatFigure(value)}
            <span className="ml-1 text-sm font-bold text-fg-subtle">{unit}</span>
          </>
        )}
      </p>
    </div>
  );
}

/** Mirrors the loaded layout so nothing shifts when the figures land. */
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-card" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.75rem] rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-card lg:col-span-2" />
        <Skeleton className="h-72 rounded-card" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}

/** The whole body, for the provider's Suspense fallback. */
export function AnalyticsViewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-36" />
      </div>
      <AnalyticsSkeleton />
    </div>
  );
}
