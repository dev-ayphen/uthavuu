"use client";

import { useListState } from "@/components/data";
import { cn } from "@/lib/cn";

import { STATUS_FILTER_KEY } from "./use-support-tickets";
import { useTicketCatalogue } from "./use-ticket-catalogue";

/**
 * The queue's status tabs — All / Open / In Progress / Waiting / Resolved /
 * Closed.
 *
 * WHY THESE ARE BUTTONS AND NOT `role="tablist"`
 * ───────────────────────────────────────────────────────────────────────────
 * A tablist promises tabpanels: arrow-key navigation between tabs, one panel
 * per tab, and `aria-controls` pointing at it. There is one table here, whose
 * CONTENTS change — that is a filter with a segmented control, not a tab set.
 * Announcing it as tabs would make a screen-reader user hunt for five panels
 * that do not exist. `aria-pressed` says the true thing: this control is on.
 *
 * WHY IT DRIVES THE SAME FILTER THE URL OWNS
 * ───────────────────────────────────────────────────────────────────────────
 * Straight through `useListState`, like every other filter, so the tab strip
 * has no state of its own. That is what keeps `/platform/support?status=open`
 * and clicking "Open" the same view — an operator pasting the link into a
 * handover note hands over what they were looking at. It also means "All" is
 * genuinely the resting state: it clears the param rather than writing
 * `status=all`, so the plain URL stays clean and `isNarrowed` stays honest
 * about whether the empty queue is empty or merely filtered.
 *
 * NO COUNTS ON THE TABS. "Open (14)" would need a per-status count, and no
 * endpoint serves one. Deriving it from the page currently in hand would give
 * the count of open tickets ON THIS PAGE, labelled as though it were the queue
 * — a number that is wrong, looks authoritative, and changes when you paginate.
 * If the API ever returns per-status totals, they belong here; until then,
 * nothing does.
 */
export function StatusTabs() {
  const { params, setFilter } = useListState();
  const catalogue = useTicketCatalogue();
  const active = params.filters[STATUS_FILTER_KEY] ?? "";

  // From `GET /admin/support-tickets/catalogue`, pre-ordered by the lookup
  // table's `sort_order` so the strip reads as a pipeline rather than as an
  // alphabetical list. Falls back to the transcribed five before that resolves
  // — an empty tab bar on arrival would be a worse failure than a stale one.
  const tabs = [{ value: "", label: "All" }, ...catalogue.statuses];

  return (
    <div
      role="group"
      aria-label="Filter tickets by status"
      className="flex flex-wrap items-center gap-1 border-b border-border pb-2"
    >
      {tabs.map((tab) => {
        const selected = active === tab.value;

        return (
          <button
            key={tab.value || "all"}
            type="button"
            aria-pressed={selected}
            // `null` clears the param entirely — see the note above on why
            // "All" must not be written to the URL as a value.
            onClick={() => setFilter(STATUS_FILTER_KEY, tab.value || null)}
            className={cn(
              "rounded-control px-3 py-1.5 text-xs font-semibold transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none",
              selected
                ? "bg-primary-soft text-primary-soft-fg"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
