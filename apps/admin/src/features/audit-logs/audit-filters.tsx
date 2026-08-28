"use client";

import { FilterX, X } from "lucide-react";
import { useId } from "react";

import { useListState } from "@/components/data";
import { Badge, Button, Input, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAuditCatalogue } from "./use-audit-logs";

/**
 * Audit Logs' own filter row.
 *
 * NOT `<FilterBar>`, and that is the whole point: FilterBar always renders a
 * search box, and this endpoint has no `q` (see the note in use-audit-logs.ts).
 * A search box that silently returns every row is a worse lie than no search
 * box. Everything else here — URL-backed values, the active-filter tint, the
 * "Clear all" escape hatch, the live-region announcement — matches FilterBar
 * deliberately, so the two read as the same control.
 */
export function AuditFilters({ resultCount }: { resultCount: number | null }) {
  const { params, activeFilterCount, isNarrowed, setFilter, clearAll, isFilterActive } =
    useListState();
  const catalogue = useAuditCatalogue();
  const actionId = useId();
  const targetTypeId = useId();
  const fromId = useId();
  const toId = useId();

  const actions = catalogue.data?.actions ?? [];
  const targetTypes = catalogue.data?.targetTypes ?? [];

  // The catalogue rides the same 403 as the list, which already explains itself
  // properly. Disabling rather than hiding keeps the row from reflowing when it
  // loads, and a disabled control is honest about being temporarily unusable.
  const optionsUnavailable = catalogue.isPending || catalogue.isError;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={actionId} className="micro-label whitespace-nowrap">
          Action
        </label>
        <Select
          id={actionId}
          size="sm"
          value={params.filters.action ?? ""}
          disabled={optionsUnavailable}
          onChange={(event) => setFilter("action", event.target.value)}
          className={cn(
            "w-auto max-w-56",
            isFilterActive("action") &&
              "border-primary-soft-border bg-primary-soft text-primary-soft-fg",
          )}
        >
          <option value="">All actions</option>
          {actions.map((action) => (
            <option key={action.key} value={action.key}>
              {action.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={targetTypeId} className="micro-label whitespace-nowrap">
          Target
        </label>
        <Select
          id={targetTypeId}
          size="sm"
          value={params.filters.targetType ?? ""}
          disabled={optionsUnavailable}
          onChange={(event) => setFilter("targetType", event.target.value)}
          className={cn(
            "w-auto",
            isFilterActive("targetType") &&
              "border-primary-soft-border bg-primary-soft text-primary-soft-fg",
          )}
        >
          <option value="">All targets</option>
          {targetTypes.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={fromId} className="micro-label whitespace-nowrap">
          From
        </label>
        <Input
          id={fromId}
          type="date"
          value={params.filters.from ?? ""}
          // The API rejects `from > to` with a 400 (`\`from\` must not be after
          // \`to\``). Constraining the pickers means that validation error is
          // unreachable through the UI instead of being explained after the fact.
          max={params.filters.to || undefined}
          onChange={(event) => setFilter("from", event.target.value)}
          className={cn(
            "h-8 w-auto px-2.5 text-xs",
            isFilterActive("from") &&
              "border-primary-soft-border bg-primary-soft text-primary-soft-fg",
          )}
        />
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={toId} className="micro-label whitespace-nowrap">
          To
        </label>
        <Input
          id={toId}
          type="date"
          value={params.filters.to ?? ""}
          min={params.filters.from || undefined}
          onChange={(event) => setFilter("to", event.target.value)}
          className={cn(
            "h-8 w-auto px-2.5 text-xs",
            isFilterActive("to") &&
              "border-primary-soft-border bg-primary-soft text-primary-soft-fg",
          )}
        />
      </div>

      {/* Deep-link filters have no dropdown of their own — they arrive from a
          link ("everything this admin did"). Rendering them as removable chips
          is what stops the list being narrowed by something invisible, which is
          how an operator concludes rows are missing. */}
      <IdChip label="Actor" value={params.filters.actorUserId} onClear={() => setFilter("actorUserId", null)} />
      <IdChip label="Target id" value={params.filters.targetId} onClear={() => setFilter("targetId", null)} />

      {isNarrowed ? (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <FilterX />
          Clear all
          {activeFilterCount > 0 ? (
            <Badge tone="neutral" className="ml-0.5">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {resultCount === null
          ? ""
          : `${resultCount} ${resultCount === 1 ? "entry" : "entries"}${
              isNarrowed ? " matching the current filters" : ""
            }`}
      </p>
    </div>
  );
}

function IdChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string | undefined;
  onClear: () => void;
}) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-1 rounded-pill border border-primary-soft-border bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary-soft-fg">
      <span className="micro-label text-primary-soft-fg">{label}</span>
      <code className="font-mono" title={value}>
        {value.slice(0, 8)}…
      </code>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear the ${label.toLowerCase()} filter`}
        className="rounded-pill p-0.5 transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  );
}
