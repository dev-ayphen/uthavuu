"use client";

import { FilterX } from "lucide-react";

import { Badge, Button, filterTint, InlineField, Input } from "@/components/ui";
import { useListState } from "@/hooks/use-list-state";
import { cn } from "@/lib/cn";

/**
 * The parts of a filter row that read the list state, whether or not the row
 * uses `FilterBar`.
 *
 * WHY THESE ARE SEPARATE FROM `FilterBar`
 * ───────────────────────────────────────────────────────────────────────────
 * `FilterBar` is the assembled default: a search box, a run of `<select>`s, and
 * nothing else. Three lists cannot use it and say so in their own headers —
 * Audit Logs has no `q` on the endpoint, Impact Stories needs two date inputs
 * in the middle of the run, Flagged Comments has exactly one filter. Each of
 * them then re-typed the escape hatch, the announcement and the active tint by
 * hand, and the three copies had already picked up small differences.
 *
 * So the PIECES live here and `FilterBar` composes them like anybody else. A
 * bespoke filter row now differs from the default only in the controls it
 * arranges, never in how it clears itself or what it announces.
 *
 * WHY THIS FILE AND NOT `@uthavu/libs-web`
 * ───────────────────────────────────────────────────────────────────────────
 * Everything here is wired to `useListState` — the URL is where a filter's
 * value lives in this console. The purely presentational half of the row
 * (`FilterRow`, `FilterSelect`, the active tint) has no such dependency and
 * lives in the shared package instead, which is why `filterTint` is imported
 * above rather than declared here.
 */

/**
 * The way out of a filtered-to-zero list.
 *
 * NOT DECORATION. Without a visible way back, an operator looking at an empty
 * table cannot tell "these records are gone" from "I filtered them out three
 * clicks ago", and the reasonable conclusion is the alarming one. It appears
 * exactly when something is narrowing the list, and it reports how many things
 * — because "clear all" with no count leaves them guessing what they are about
 * to lose.
 */
export function ClearFiltersButton({ className }: { className?: string }) {
  const { activeFilterCount, isNarrowed, clearAll } = useListState();

  if (!isNarrowed) return null;

  return (
    <Button variant="ghost" size="sm" onClick={clearAll} className={className}>
      <FilterX />
      Clear all
      {activeFilterCount > 0 ? (
        <Badge tone="neutral" className="ml-0.5">
          {activeFilterCount}
        </Badge>
      ) : null}
    </Button>
  );
}

/**
 * Says the result count out loud, to nobody who can see.
 *
 * Debounced search gives no visible confirmation that anything happened until
 * the rows change — and a screen-reader user gets nothing at all, because the
 * table redrawing below is not an event anything announces. This is the only
 * feedback that the thing they typed did something.
 *
 * `aria-live="polite"` and NOT `role="alert"`: it fires on every keystroke's
 * settle, and an assertive region would talk over the operator mid-word.
 */
export function ResultAnnouncer({
  count,
  /** Singular noun — "entry", "story", "ticket". Pluralised with `s` unless overridden. */
  noun = "result",
  pluralNoun,
}: {
  /** `null` while unknown — announces nothing rather than announcing zero. */
  count: number | null | undefined;
  noun?: string;
  pluralNoun?: string;
}) {
  const { isNarrowed } = useListState();

  const message =
    count === null || count === undefined
      ? ""
      : `${count} ${count === 1 ? noun : (pluralNoun ?? `${noun}s`)}${
          isNarrowed ? " matching the current filters" : ""
        }`;

  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}

/**
 * A `from`/`to` pair, bound to each other.
 *
 * The API rejects `from > to` with a 400. Constraining each picker by the
 * other's value makes that validation error unreachable through the UI, rather
 * than explained after the fact — which is the whole difference between a
 * control that teaches the rule and one that enforces it by refusing.
 */
export function DateRangeFilter({
  fromKey = "from",
  toKey = "to",
  fromLabel = "From",
  toLabel = "To",
}: {
  fromKey?: string;
  toKey?: string;
  fromLabel?: string;
  toLabel?: string;
}) {
  const { params, setFilter, isFilterActive } = useListState();
  const from = params.filters[fromKey] ?? "";
  const to = params.filters[toKey] ?? "";

  return (
    <>
      <InlineField label={fromLabel}>
        {(id) => (
          <Input
            id={id}
            type="date"
            density="compact"
            value={from}
            max={to || undefined}
            onChange={(event) => setFilter(fromKey, event.target.value)}
            className={cn(filterTint(isFilterActive(fromKey)))}
          />
        )}
      </InlineField>

      <InlineField label={toLabel}>
        {(id) => (
          <Input
            id={id}
            type="date"
            density="compact"
            value={to}
            min={from || undefined}
            onChange={(event) => setFilter(toKey, event.target.value)}
            className={cn(filterTint(isFilterActive(toKey)))}
          />
        )}
      </InlineField>
    </>
  );
}
