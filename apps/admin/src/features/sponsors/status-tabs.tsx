"use client";

import { useListState } from "@/components/data";
import { cn } from "@/lib/cn";

/**
 * The six status filters, as a segmented control.
 *
 * WHY TABS AND NOT THE SHARED `FilterBar` DROPDOWN
 * ───────────────────────────────────────────────────────────────────────────
 * Every other list in this console filters status through a `<select>`, and
 * that is the right default for a filter with many values or one an operator
 * rarely touches. This one is neither: `docs/webadmin/08-monetization.md` §3.2
 * makes the six status tabs the primary way this list is read, because the
 * campaign lifecycle IS the job here — an operator's first question in the
 * morning is "what's live and what expired overnight", not "find me a sponsor".
 * A dropdown hides five of six answers behind a click and shows no sense of the
 * whole. Six fixed values is exactly the case a segmented control is for.
 *
 * The order is not a choice either: it matches `sponsor_statuses.sort_order` in
 * `apps/api/src/db/schema/sponsors-schema.ts`, which the schema comment says
 * "matches the console's tab order exactly (§3.2 #1) so the filter renders in
 * the order it was designed in without the client re-sorting".
 *
 * WHY THESE ARE BUTTONS AND NOT `role="tablist"`
 * ───────────────────────────────────────────────────────────────────────────
 * ARIA tabs promise a tabpanel each, arrow-key roving focus, and a relationship
 * between a tab and the panel it reveals. This is one table being filtered, not
 * six panels. `aria-pressed` on plain buttons describes what is actually
 * happening — a toggle in a group — and keeps Tab moving through them the way a
 * keyboard user expects of a filter row.
 *
 * "All" IS THE EMPTY STRING, WHICH IS THE DEFAULT. That matters beyond tidiness:
 * `status` has no default filter value in `SPONSORS_LIST`, so at rest
 * `isNarrowed` is false and an empty table says "No sponsors yet" rather than
 * "nothing matched your filters". Pick any other tab and it flips, which is the
 * whole point — see the empty-state copy in `sponsors-table.tsx`.
 */

const TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
  { value: "draft", label: "Draft" },
] as const;

export function SponsorStatusTabs() {
  const { params, setFilter } = useListState();
  const current = params.filters.status ?? "";

  return (
    <div
      role="group"
      aria-label="Filter sponsors by status"
      className="flex flex-wrap items-center gap-1 rounded-control border border-border bg-surface-2 p-1"
    >
      {TABS.map((tab) => {
        const active = current === tab.value;
        return (
          <button
            key={tab.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => setFilter("status", tab.value || null)}
            className={cn(
              "rounded-control px-3 py-1.5 text-xs font-semibold transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
              active
                ? "bg-surface text-fg shadow-card"
                : "text-fg-subtle hover:bg-surface/60 hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
