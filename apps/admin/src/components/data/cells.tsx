"use client";

import Image from "next/image";
import { EyeOff, UserX } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Cell renderers shared by every table in the console.
 *
 * They exist mostly to make ABSENCE unambiguous. A blank cell has at least four
 * meanings — no value, a removed value, a deleted owner, a bug — and a table
 * that renders all four as whitespace forces a moderator to guess. Each one
 * here says which it is.
 */

/** The one true "no value". Never render an empty cell; render this. */
export function EmptyCell({ label = "—" }: { label?: string }) {
  return (
    <span aria-label="No value" className="text-fg-faint select-none">
      {label}
    </span>
  );
}

export function TextCell({
  value,
  className,
  /** Clamp to one line. The full value goes in `title` for hover. */
  truncate = true,
}: {
  value: string | null | undefined;
  className?: string;
  truncate?: boolean;
}) {
  if (!value) return <EmptyCell />;
  return (
    <span
      title={truncate ? value : undefined}
      className={cn("text-fg", truncate && "block truncate", className)}
    >
      {value}
    </span>
  );
}

export function MutedCell({ value, className }: { value: ReactNode; className?: string }) {
  if (value === null || value === undefined || value === "") return <EmptyCell />;
  return <span className={cn("text-fg-subtle", className)}>{value}</span>;
}

/** Ids, keys, cursors. Monospace so a mismatched character is visible. */
export function CodeCell({ value, truncate = 8 }: { value: string | null | undefined; truncate?: number | false }) {
  if (!value) return <EmptyCell />;
  const shown = truncate === false ? value : value.slice(0, truncate);
  return (
    <code title={value} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
      {shown}
      {truncate !== false && value.length > truncate ? "…" : ""}
    </code>
  );
}

/** Right-align these in the column def; `tabular` stops digits jittering. */
export function CountCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <EmptyCell />;
  return <span className="tabular text-fg">{new Intl.NumberFormat("en-IN").format(value)}</span>;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  // Fixed locale AND zone. Uthavu is a Tamil Nadu product, moderators work in
  // IST, and letting the server's own TZ decide makes the same row read
  // differently between a laptop and a Vercel region.
  timeZone: "Asia/Kolkata",
});

const DATETIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

export function formatDate(iso: string | null | undefined, withTime = false): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (withTime ? DATETIME_FORMAT : DATE_FORMAT).format(date);
}

export function DateCell({
  value,
  withTime = false,
  relative = false,
}: {
  value: string | null | undefined;
  withTime?: boolean;
  /** Adds "3 hours ago" beneath. Client-only — see the note in RelativeTime. */
  relative?: boolean;
}) {
  const formatted = formatDate(value, withTime);
  if (!formatted) return <EmptyCell />;

  return (
    <span className="tabular block whitespace-nowrap text-fg-subtle">
      {formatted}
      {relative && value ? (
        <span className="block text-[11px] text-fg-faint">
          <RelativeTime value={value} />
        </span>
      ) : null}
    </span>
  );
}

/** Never resubscribes: "have we hydrated yet" changes exactly once, at hydration. */
const NEVER_CHANGES = () => () => {};

/**
 * False during SSR and the hydrating render, true afterwards.
 *
 * `useSyncExternalStore` is the sanctioned way to ask this. The obvious
 * alternative — `useState(false)` plus an effect that sets it true — computes
 * the value in a second render pass triggered from an effect, which is a
 * cascading render and is what `react-hooks/set-state-in-effect` objects to.
 * Here the server snapshot IS false and the client snapshot IS true, so React
 * resolves it in one pass with no extra state.
 */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/**
 * "3 hours ago", rendered only once hydrated.
 *
 * Relative time is a function of `Date.now()`, so the server and the browser
 * necessarily compute different strings and React reports a hydration
 * mismatch. Rendering nothing until hydration makes the two agree.
 */
export function RelativeTime({ value }: { value: string }) {
  const hydrated = useIsHydrated();
  if (!hydrated) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return <>{formatRelative(date)}</>;
}

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

export function formatRelative(date: Date, now: Date = new Date()): string {
  let duration = (date.getTime() - now.getTime()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return RELATIVE_FORMAT.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return "";
}

export type PersonRef = {
  id?: string;
  name?: string | null;
  avatarUrl?: string | null;
  /** The account was deleted. The comment it authored still exists. */
  deleted?: boolean;
};

/**
 * A person, including one who no longer exists.
 *
 * `author.deleted` is a real state on `/admin/comments`: the comment survives
 * its author. Rendering that as a blank name would read as missing data and
 * send a moderator looking for a bug; naming it is both honest and the answer
 * to "why can't I open this profile?".
 */
export function PersonCell({
  person,
  secondary,
  showAvatar = true,
}: {
  person: PersonRef | null | undefined;
  /** Second line — a phone number, a city, an email. */
  secondary?: string | null;
  showAvatar?: boolean;
}) {
  if (!person) return <EmptyCell />;

  if (person.deleted) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-3 text-fg-faint">
          <UserX className="size-3" aria-hidden />
        </span>
        <span className="italic text-fg-faint">Deleted account</span>
      </span>
    );
  }

  const name = person.name?.trim() || "Unnamed";

  return (
    <span className="flex min-w-0 items-center gap-2">
      {showAvatar ? <Avatar url={person.avatarUrl} name={name} /> : null}
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg" title={name}>
          {name}
        </span>
        {secondary ? (
          <span className="block truncate text-[11px] text-fg-faint" title={secondary}>
            {secondary}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function Avatar({ url, name }: { url: string | null | undefined; name: string }) {
  // A photo can 404 (local-disk storage, ADR 0008) or come from a host that is
  // not in next.config's remotePatterns. Either way the initials must survive,
  // so a load failure falls back rather than leaving a hole in the row.
  const [failed, setFailed] = useState(false);
  const initials = name.slice(0, 1).toUpperCase();

  if (!url || failed) {
    return (
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-[10px] font-bold text-primary-soft-fg"
      >
        {initials}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={24}
      height={24}
      onError={() => setFailed(true)}
      className="size-6 shrink-0 rounded-pill object-cover"
    />
  );
}

/**
 * Content taken down by a moderator.
 *
 * The body is still shown. A removal notice with the text hidden makes the
 * moderation log unreviewable — the whole reason to open the row is to see
 * what was removed and judge whether that was right.
 */
export function RemovedContentCell({
  body,
  removed,
  removedLabel = "Removed",
}: {
  body: string | null | undefined;
  removed: boolean;
  removedLabel?: string;
}) {
  if (!body) return <EmptyCell />;

  return (
    <span className="flex min-w-0 items-start gap-2">
      {removed ? (
        <Badge tone="danger" className="mt-0.5 shrink-0">
          <EyeOff className="size-2.5" aria-hidden />
          {removedLabel}
        </Badge>
      ) : null}
      <span
        title={body}
        className={cn("block min-w-0 truncate", removed ? "text-fg-faint line-through" : "text-fg")}
      >
        {body}
      </span>
    </span>
  );
}

/** Yes/no, said in words. A bare ✓/✗ column is unreadable without a legend. */
export function BooleanCell({
  value,
  trueLabel = "Yes",
  falseLabel = "No",
  trueTone = "success",
}: {
  value: boolean | null | undefined;
  trueLabel?: string;
  falseLabel?: string;
  trueTone?: "success" | "info" | "primary";
}) {
  if (value === null || value === undefined) return <EmptyCell />;
  return (
    <Badge tone={value ? trueTone : "neutral"}>{value ? trueLabel : falseLabel}</Badge>
  );
}
