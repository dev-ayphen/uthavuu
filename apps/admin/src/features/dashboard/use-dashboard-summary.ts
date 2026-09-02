"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

/**
 * Dashboard data, from `GET /admin/dashboard`.
 *
 * THE NULL DISCIPLINE — the whole point of this file
 * ───────────────────────────────────────────────────────────────────────────
 * Every tile on the dashboard shows one of three things: a real number, or an
 * em dash, or nothing at all. It never shows a plausible-looking zero.
 *
 *   a `0` on "Fake reports" reads as "nothing to review". The truth is "we do
 *   not track this yet". An ops person ACTS on the first and INVESTIGATES the
 *   second, so showing 0 would be worse than showing nothing.
 *
 * That is why no field here is coerced with `?? 0`, why `readNumber` refuses
 * anything that is not a finite number (an object, a string, a NaN), and why a
 * counter the API omits entirely is distinguished from one it explicitly sends
 * as null. The console removed invented login statistics for exactly this
 * reason (docs/_audit/issues.md issue 18); this is the guardrail that keeps
 * them from creeping back in through a lenient parse.
 *
 * `flaggedReportsPendingReview` is null *permanently*, not pending: only
 * comments can be flagged in this product; there is no flagged-reports table.
 * Its `note` says so, so an operator staring at the em dash stops wondering.
 *
 * FORWARD/BACKWARD COMPATIBILITY
 * ───────────────────────────────────────────────────────────────────────────
 * The extended counters (`activeUsers`, `helpsGiven`, `fieldUpdates`,
 * `commentsToday`, `impactStories`, `criticalOpen`) are read by name and are
 * OPTIONAL. Against an API build that predates them the key is absent, the
 * counter resolves to null, and the tile renders an em dash — which is the
 * honest render either way. When the backend ships them the numbers appear with
 * no change to this file.
 */

export type CounterKey =
  | "activeUsers"
  | "criticalOpen"
  | "fakeReports"
  | "pendingReview"
  | "helpsGiven"
  | "fieldUpdates"
  | "commentsToday"
  | "impactStories";

export type TotalKey = "users" | "reportsToday" | "activeMissions" | "completedToday";

/**
 * One tile's worth of truth.
 *
 * `note` is the tile's own footnote — the API's stated basis for the number, or
 * this console's standing explanation for why there is no number. It is what
 * turns a bare em dash from "something is broken" into "this is not counted",
 * which are two very different things to an operator at 2am.
 */
export type Counter = {
  /** `null` = there is no number. Render an em dash — never a 0. */
  value: number | null;
  /** Why the tile reads as it does, or null when the number speaks for itself. */
  note: string | null;
};

export type DashboardSummary = {
  totals: Record<TotalKey, Counter>;
  counters: Record<CounterKey, Counter>;
  /** IANA zone the API counted "today" in. Surfaced so the figures are legible. */
  timeZone: string | null;
  generatedAt: string | null;
};

/**
 * The wire shape, for documentation. The parser below does NOT trust it — see
 * `readCounter` — because a field arriving as the wrong type must degrade to an
 * em dash, not to `NaN` painted into a tile.
 */
export type AdminDashboardResponse = {
  totalUsers: number;
  todaysReports: number;
  activeMissions: number;
  completedToday: number;
  flaggedCommentsPendingReview: number;
  /** Permanently null. See the header. */
  flaggedReportsPendingReview: null;
  activeUsers: number;
  criticalOpen: number;
  helpsGiven: number;
  fieldUpdates: number;
  commentsToday: number;
  impactStories: number;
  /**
   * What each counter actually measured, keyed by counter name. The API sends
   * this precisely because several of these numbers do not mean what their tile
   * label implies — "Critical open" measures deadline proximity, not severity,
   * because `reports` has no priority column at all. Surfacing the caveat is
   * not decoration: a number whose basis is unstated is a number nobody can act
   * on, and the tile would otherwise be quietly wrong.
   */
  basis?: Partial<
    Record<CounterKey | "flaggedReportsPendingReview", { basis: string; caveat: string }>
  >;
  timeZone: string;
  generatedAt: string;
};

const FAKE_REPORTS_NOTE =
  "Not tracked, and not pending either: only comments can be flagged in Uthavu — there is no flagged-reports table for this number to come from. This tile stays blank on purpose. Flagged comments are counted under “Pending review”.";

const NOT_RETURNED_NOTE =
  "The API serving this console doesn’t return this counter yet, so there is nothing to show. Blank means “not counted”, not zero.";

const NO_SOURCE_NOTE =
  "The API has no source for this number yet and returned nothing rather than guess. Blank means “not counted”, not zero.";

const MISSING_TOTAL_NOTE =
  "The API didn’t return this total. That is unexpected — the other figures may be from a different moment.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Anything that is not a finite number becomes null. No `Number()` coercion. */
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * One counter, with the absent/null distinction preserved.
 *
 * "The key isn't there" and "the key is there and null" are different facts
 * about the deployment, and an operator chasing a blank tile is helped by
 * knowing which one they are looking at.
 */
function readCounter(
  body: Record<string, unknown>,
  field: string,
  basisKey?: string,
  missingNote = NOT_RETURNED_NOTE,
): Counter {
  // The API's own words win over anything this file could say. When the payload
  // states a basis, that IS the footnote — including for the counters that came
  // back with a perfectly real number, because those are the ones most likely
  // to be misread ("Impact stories" is a count of completions; there is no
  // stories table).
  const caveat = basisKey ? readCaveat(body, basisKey) : null;

  if (!(field in body)) return { value: null, note: caveat ?? missingNote };

  const value = readNumber(body[field]);
  if (caveat) return { value, note: caveat };
  return { value, note: value === null ? NO_SOURCE_NOTE : null };
}

/** `basis.criticalOpen.caveat`, when the API build sends one. */
function readCaveat(body: Record<string, unknown>, key: string): string | null {
  if (!isRecord(body.basis)) return null;
  const entry = body.basis[key];
  return isRecord(entry) ? readString(entry.caveat) : null;
}

/**
 * The viewer's own zone, so "today" means their today rather than the server's.
 * Falls through to the API default (Asia/Kolkata) if the browser won't say.
 */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function readDashboardSummary(raw: unknown): DashboardSummary {
  const body = isRecord(raw) ? raw : {};

  return {
    totals: {
      users: readCounter(body, "totalUsers", undefined, MISSING_TOTAL_NOTE),
      reportsToday: readCounter(body, "todaysReports", undefined, MISSING_TOTAL_NOTE),
      activeMissions: readCounter(body, "activeMissions", undefined, MISSING_TOTAL_NOTE),
      completedToday: readCounter(body, "completedToday", undefined, MISSING_TOTAL_NOTE),
    },
    counters: {
      activeUsers: readCounter(body, "activeUsers", "activeUsers"),
      criticalOpen: readCounter(body, "criticalOpen", "criticalOpen"),
      // Always an em dash — the API sends null and says why. The local constant
      // is only the fallback for a build that predates the basis map; either
      // way the tooltip is what stops an operator filing a bug about the blank
      // tile once a week.
      fakeReports: readCounter(
        body,
        "flaggedReportsPendingReview",
        "flaggedReportsPendingReview",
        FAKE_REPORTS_NOTE,
      ),
      pendingReview: readCounter(body, "flaggedCommentsPendingReview"),
      helpsGiven: readCounter(body, "helpsGiven", "helpsGiven"),
      fieldUpdates: readCounter(body, "fieldUpdates", "fieldUpdates"),
      commentsToday: readCounter(body, "commentsToday", "commentsToday"),
      impactStories: readCounter(body, "impactStories", "impactStories"),
    },
    timeZone: readString(body.timeZone),
    generatedAt: readString(body.generatedAt),
  };
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["admin", "dashboard", browserTimeZone() ?? "default"],
    queryFn: async (): Promise<DashboardSummary> => {
      const raw = await apiFetch<unknown>("/admin/dashboard", {
        searchParams: { timeZone: browserTimeZone() },
      });
      return readDashboardSummary(raw);
    },
  });
}

/** Formats a counter for display: a real number, or an em dash when untracked. */
export function formatCount(value: number | null | undefined): string | number {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}
