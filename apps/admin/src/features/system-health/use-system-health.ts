"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

/**
 * Platform -> System health, from `GET /admin/system-health`.
 *
 * Runtime facts only. `AdminSystemHealthService` samples nothing over time and
 * persists nothing, so there is no latency history to draw and none is invented
 * here — a single `latencyMs` sample is reported as the single sample it is.
 *
 * Every field below can carry bad news without the request failing: each check
 * returns `reachable: false` plus its error rather than throwing, because a
 * health endpoint that 500s when Redis is down tells the operator only that
 * something is wrong, never which thing.
 */

export type HealthCheck = {
  reachable: boolean;
  latencyMs: number;
  error: string | null;
};

export type DatabaseHealth = HealthCheck & {
  /** Null when the database could not be reached at all. */
  migrations: {
    applied: number;
    latestAppliedAt: string | null;
    /** Migration file name, e.g. `0019_motionless_invaders`. Null if unresolvable. */
    head: string | null;
  } | null;
};

export type SystemHealth = {
  /** Derived by the API from the parts. Never assume "healthy". */
  status: "healthy" | "degraded";
  database: DatabaseHealth;
  redis: HealthCheck;
  process: {
    uptimeSeconds: number;
    startedAt: string;
    nodeVersion: string;
    /** Deliberately unset in the local Docker image (ADR 0007). Null, not guessed. */
    nodeEnv: string | null;
  };
  config: {
    adminUrlConfigured: boolean;
    msg91Configured: boolean;
    /** True while the API logs OTP codes to its own console instead of sending SMS. */
    devOtpFallbackActive: boolean;
    fcmConfigured: boolean;
    /** Always false today: nothing in the codebase dispatches a push. */
    pushDeliveryImplemented: boolean;
  };
  checkedAt: string;
};

export function useSystemHealth() {
  return useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: ({ signal }) => apiFetch<SystemHealth>("/admin/system-health", { signal }),
    // A health page whose numbers are minutes old is worse than no health page:
    // it reports the state of a container that may since have died. Nothing is
    // cached, and it re-checks itself while the tab is open.
    staleTime: 0,
    refetchInterval: 30_000,
    // Re-asking cannot turn a permission refusal into permission.
    retry: false,
  });
}

/**
 * Seconds as an operator reads uptime: "10m 24s", "3h 12m", "2d 4h".
 *
 * Two units, never three — the third is noise at every scale that matters, and
 * "up 2d" answers the question ("did it restart?") that the page is asked.
 */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
