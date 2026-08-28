"use client";

import {
  Bell,
  CheckCircle2,
  Database,
  Info,
  MessageSquareWarning,
  RotateCcw,
  Server,
  Shield,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { ListFailureState, RelativeTime, formatDate } from "@/components/data";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import { classifyListFailure } from "@/lib/list-failure";
import { formatUptime, useSystemHealth, type HealthCheck } from "./use-system-health";

/**
 * Is the thing up right now, and what is it running.
 *
 * NOTHING HERE IS HARDCODED GREEN. Every badge, including the headline, is
 * derived from the response — `status`, `reachable`, and the config booleans.
 * A status page that always says "operational" is worse than no status page:
 * it is a green light wired to nothing, and the first time it matters it lies.
 */
export function SystemHealthView() {
  const { data, isPending, isError, error, isFetching, refetch } = useSystemHealth();

  // Branch order: loading -> error -> content. A refusal is not an error —
  // `classifyListFailure` separates the 403 an ops admin correctly gets from
  // the API actually being unreachable, and `ListFailureState` renders each
  // at its own volume.
  if (isPending) return <HealthSkeleton />;
  if (isError) {
    return <ListFailureState failure={classifyListFailure(error)} onRetry={() => void refetch()} />;
  }

  const healthy = data.status === "healthy";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={healthy ? "success" : "danger"} className="px-2.5 py-1 text-[11px]">
            {healthy ? (
              <CheckCircle2 className="size-3" aria-hidden />
            ) : (
              <XCircle className="size-3" aria-hidden />
            )}
            {healthy ? "All systems healthy" : "Degraded"}
          </Badge>
          {/* The API's own timestamp, not the browser's — this is when the
              checks actually ran, which is the only honest thing to date them by. */}
          <span className="text-[11px] text-fg-faint">
            Checked <RelativeTime value={data.checkedAt} />
            {" · "}
            <span className="tabular">{formatDate(data.checkedAt, true)}</span>
            {" IST"}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RotateCcw />
          {isFetching ? "Checking…" : "Re-check now"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <Database className="size-4 text-primary" />
              PostgreSQL
            </CardTitle>
            <ReachableBadge check={data.database} />
          </CardHeader>
          <CardBody className="space-y-3">
            <Fact label="Round trip" value={<Latency check={data.database} />} />
            {data.database.migrations ? (
              <>
                <Fact
                  label="Migration head"
                  value={
                    data.database.migrations.head ? (
                      <code className="font-mono text-[11px] text-fg">
                        {data.database.migrations.head}
                      </code>
                    ) : (
                      // The journal is COPYed into the image; if it is missing
                      // the API returns null rather than naming a wrong file.
                      <Unknown reason="The migration journal wasn't readable, so the head can't be named." />
                    )
                  }
                />
                <Fact
                  label="Migrations applied"
                  value={<span className="tabular">{data.database.migrations.applied}</span>}
                />
                <Fact
                  label="Last applied"
                  value={
                    data.database.migrations.latestAppliedAt ? (
                      <span className="tabular text-xs">
                        {formatDate(data.database.migrations.latestAppliedAt, true)}
                      </span>
                    ) : (
                      <Unknown reason="No migration has been recorded." />
                    )
                  }
                />
              </>
            ) : (
              <p className="text-xs text-fg-subtle">
                Migration state is unknown while the database is unreachable.
              </p>
            )}
            <CheckError check={data.database} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Zap className="size-4 text-primary" />
              Redis
            </CardTitle>
            <ReachableBadge check={data.redis} />
          </CardHeader>
          <CardBody className="space-y-3">
            <Fact label="PING round trip" value={<Latency check={data.redis} />} />
            <p className="text-[11px] text-fg-faint">
              Backs sessions, rate limits and queues. A single live sample, not an average — the
              API keeps no metrics store to average over.
            </p>
            <CheckError check={data.redis} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Server className="size-4 text-primary" />
              API process
            </CardTitle>
            <Badge tone="neutral" className="font-mono">
              {data.process.nodeVersion}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-3">
            <Fact
              label="Uptime"
              value={
                <span className="tabular text-fg">{formatUptime(data.process.uptimeSeconds)}</span>
              }
            />
            <Fact
              label="Started"
              value={
                <span className="tabular text-xs">
                  {formatDate(data.process.startedAt, true)}
                </span>
              }
            />
            <Fact
              label="NODE_ENV"
              value={
                data.process.nodeEnv ? (
                  <code className="font-mono text-[11px] text-fg">{data.process.nodeEnv}</code>
                ) : (
                  // An em dash, never "development". The variable is genuinely
                  // unset in the local image, and guessing a value here would
                  // hide exactly the misconfiguration this row exists to expose.
                  <Unknown reason="Not set on this process. A real deploy target must set it to production — ADR 0007's hard block depends on it." />
                )
              }
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Shield className="size-4 text-primary" />
            Configuration
          </CardTitle>
          <span className="text-[11px] text-fg-faint">
            Whether a credential is set — never the credential itself
          </span>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ConfigFlag
            icon={Shield}
            label="Admin CORS origin"
            configured={data.config.adminUrlConfigured}
            onText="ADMIN_URL is set"
            offText="ADMIN_URL is unset — this console's requests will be refused by CORS"
          />
          <ConfigFlag
            icon={MessageSquareWarning}
            label="SMS / OTP (msg91)"
            configured={data.config.msg91Configured}
            onText="Real SMS is being sent"
            offText="No msg91 credentials — no real SMS is sent"
          />
          <ConfigFlag
            icon={Bell}
            label="Push credentials (FCM)"
            configured={data.config.fcmConfigured}
            onText="Firebase credentials are set"
            offText="No Firebase credentials"
          />
          <ConfigFlag
            icon={Bell}
            label="Push delivery"
            configured={data.config.pushDeliveryImplemented}
            onText="A send path exists"
            // Reported by the API as a permanent fact, not a config gap: device
            // tokens are stored, and nothing dispatches to them yet.
            offText="Not implemented — device tokens are stored, but nothing sends to them"
          />
        </CardBody>
      </Card>

      {data.config.devOtpFallbackActive ? (
        <div className="flex items-start gap-3 rounded-card border border-warning-soft-border bg-warning-soft/40 p-4">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-fg" />
          <div>
            <p className="text-sm font-bold text-fg">
              OTP codes are being logged, not texted
            </p>
            <p className="mt-1 text-fg-subtle">
              With no msg91 credentials set, the API prints each login code to its own console
              instead of sending an SMS (ADR 0007). Read them with{" "}
              <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px]">
                docker compose logs -f api
              </code>
              . This fallback is hard-blocked when <code className="font-mono text-[11px]">NODE_ENV=production</code>, and
              stops being used the moment real credentials are set — no code change needed.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReachableBadge({ check }: { check: HealthCheck }) {
  return (
    <Badge tone={check.reachable ? "success" : "danger"}>
      {check.reachable ? "Reachable" : "Unreachable"}
    </Badge>
  );
}

/** Latency is meaningless for a check that never connected — say so instead. */
function Latency({ check }: { check: HealthCheck }) {
  if (!check.reachable) return <Unknown reason="The check never connected." />;
  return <span className="tabular text-fg">{check.latencyMs} ms</span>;
}

function CheckError({ check }: { check: HealthCheck }) {
  if (!check.error) return null;
  return (
    <p className="rounded-control border border-danger-soft-border bg-danger-soft/40 px-3 py-2 font-mono text-[11px] break-words text-danger-fg">
      {check.error}
    </p>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="micro-label">{label}</span>
      <span className="min-w-0 text-right">{value}</span>
    </div>
  );
}

/**
 * "Not measured", said as an em dash with a reason on hover.
 *
 * Same rule as the dashboard's `formatCount`: a `0` reads as "nothing
 * happened", and the truth here is "there is no value to report".
 */
function Unknown({ reason }: { reason: string }) {
  return (
    <span className="text-fg-faint" title={reason} aria-label={`Not available. ${reason}`}>
      —
    </span>
  );
}

function ConfigFlag({
  icon: Icon,
  label,
  configured,
  onText,
  offText,
}: {
  icon: LucideIcon;
  label: string;
  configured: boolean;
  onText: string;
  offText: string;
}) {
  return (
    <div className="rounded-control border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Icon aria-hidden className="size-3.5 text-fg-faint" />
          {label}
        </span>
        <Badge tone={configured ? "success" : "neutral"}>{configured ? "Set" : "Not set"}</Badge>
      </div>
      <p className="mt-1.5 text-[11px] text-fg-faint">{configured ? onText : offText}</p>
    </div>
  );
}

/** Mirrors the loaded layout — same cards, same heights — so nothing shifts. */
function HealthSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-card" />
    </div>
  );
}
