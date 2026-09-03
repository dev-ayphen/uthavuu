"use client";

import { useListState } from "@/components/data";
import { SegmentedControl } from "@/components/ui";

import { STATUS_FILTER_KEY } from "./use-support-tickets";
import { useTicketCatalogue } from "./use-ticket-catalogue";

/**
 * The queue's status tabs — All / Open / In Progress / Waiting / Resolved /
 * Closed.
 *
 * The control is `@uthavu/libs-web`'s `SegmentedControl`, which carries the
 * reasoning for `role="group"` + `aria-pressed` rather than `role="tablist"`.
 * What is decided here is which options exist and where they come from.
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
    <SegmentedControl
      label="Filter tickets by status"
      options={tabs}
      value={active}
      // `null` clears the param entirely — see the note above on why "All" must
      // not be written to the URL as a value.
      onChange={(value) => setFilter(STATUS_FILTER_KEY, value || null)}
    />
  );
}
