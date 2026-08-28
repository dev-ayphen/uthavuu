"use client";

import { ArrowRight } from "lucide-react";

import { EmptyCell } from "@/components/data";

/**
 * The `before` / `after` snapshot, rendered as a diff rather than as two blobs.
 *
 * `AdminCategoriesService.update()` and friends already scope both sides to the
 * fields that actually changed, so the payload is small and a diff is the shape
 * it was written in. Printing the raw JSON twice and asking a moderator to spot
 * the difference by eye would waste the work the API did.
 *
 * Absence is meaningful on both sides and is named, never blank:
 *   before = null  -> the row was created (nothing preceded it)
 *   after  = null  -> the row was deleted (nothing followed it)
 * `before.deletedAt: null` is a real recorded value and prints as "null", which
 * is why the em dash is reserved for "this side of the change does not exist".
 */

const MAX_INLINE_FIELDS = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One JSON value, short enough to sit in a table cell. */
function format(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function truncate(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export type FieldChange = { field: string; before: unknown; after: unknown };

/**
 * Union of the keys on both sides, in `before`-then-`after` order so a field
 * that was removed still appears. Non-object snapshots (the API never sends
 * one today, but `before`/`after` are typed `unknown` for a reason) degrade to
 * a single unnamed change rather than throwing.
 */
export function diffFields(before: unknown, after: unknown): FieldChange[] {
  if (!isRecord(before) && !isRecord(after)) {
    if (before === null && after === null) return [];
    return [{ field: "value", before, after }];
  }

  const beforeRecord = isRecord(before) ? before : {};
  const afterRecord = isRecord(after) ? after : {};
  const fields = [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])];

  return fields.map((field) => ({
    field,
    before: isRecord(before) ? beforeRecord[field] : undefined,
    after: isRecord(after) ? afterRecord[field] : undefined,
  }));
}

export function ChangeCell({ before, after }: { before: unknown; after: unknown }) {
  const changes = diffFields(before, after);
  if (changes.length === 0) return <EmptyCell />;

  const shown = changes.slice(0, MAX_INLINE_FIELDS);
  const hidden = changes.length - shown.length;

  // Every field, spelled out, on hover — the cell shows the first two so the
  // row stays one line, and the title carries the rest rather than dropping it.
  const full = changes
    .map((change) => `${change.field}: ${format(change.before)} → ${format(change.after)}`)
    .join("\n");

  return (
    <span className="block min-w-0 max-w-64 space-y-0.5" title={full}>
      {shown.map((change) => (
        <span key={change.field} className="flex min-w-0 items-center gap-1 text-[11px]">
          <span className="shrink-0 font-semibold text-fg-muted">{change.field}</span>
          <span className="truncate text-fg-faint line-through">
            {truncate(format(change.before))}
          </span>
          <ArrowRight aria-hidden className="size-2.5 shrink-0 text-fg-faint" />
          <span className="truncate text-fg">{truncate(format(change.after))}</span>
        </span>
      ))}
      {hidden > 0 ? (
        <span className="block text-[10px] text-fg-faint">
          +{hidden} more field{hidden === 1 ? "" : "s"}
        </span>
      ) : null}
    </span>
  );
}
