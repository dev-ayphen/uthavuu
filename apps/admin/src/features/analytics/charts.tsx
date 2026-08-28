"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Two chart forms, built from divs. No chart library, no SVG, no canvas.
 *
 * COLOUR — MEASURED, NOT CHOSEN BY EYE
 * ───────────────────────────────────────────────────────────────────────────
 * Fills are the console's own accent tokens at 71% opacity: one declaration
 * that serves BOTH themes, so there is no `dark:` override and no invented hex.
 * The value was computed, not picked. Composited over `--surface` in each theme
 * and run through the palette validator:
 *
 *   light (#ffffff): emerald #59a575 · blue #5f81e3 · amber #ca8550
 *   dark  (#0f172a): emerald #39a467 · blue #497cbe · amber #b78e26
 *
 *   lightness band  PASS both modes (light 0.43–0.77, dark 0.48–0.67)
 *   chroma floor    PASS both
 *   CVD separation  PASS — worst adjacent pair ΔE 20.5 light / 18.3 dark (deutan)
 *   contrast        PASS dark; light emerald 2.97:1, one notch under 3:1
 *
 * That single sub-3:1 WARN is dischargeable only with visible labels or a table
 * view, so both are present by construction: every bar carries a readable
 * number beside it, and the column chart ships a screen-reader data table.
 *
 * The stack order — emerald, blue, amber — is load-bearing, not aesthetic.
 * Emerald against amber is the weak pair (ΔE 6.8 for protanopia); putting blue
 * between them means no two touching segments are ever a hard pair to separate.
 *
 * The proper fix is a `--chart-series-*` token family declared per theme, which
 * would let each mode pick its own step instead of sharing one alpha. That is a
 * design-system change and belongs in `globals.css`, not in a feature folder.
 */

/** Fixed order. A series' colour follows the series, never its rank. */
export type ChartSeries = {
  key: string;
  label: string;
  /** Tailwind background class. Fixed per series; never reassigned by sort order. */
  fill: string;
};

export const REPORT_SERIES: readonly ChartSeries[] = [
  { key: "completed", label: "Completed", fill: "bg-accent-emerald-fg/71" },
  { key: "open", label: "Still open", fill: "bg-accent-blue-fg/71" },
  { key: "expired", label: "Expired", fill: "bg-accent-amber-fg/71" },
];

/**
 * The single hue for a magnitude-only bar list, where colour carries no
 * identity — the row label does.
 *
 * Violet, and specifically NOT one of the three series hues above. The bar
 * lists sit on the same screen as the timeline, whose legend reads
 * "Still open = blue"; painting the category bars blue would invite the reader
 * to carry that meaning across panels, where it means nothing. A hue absent
 * from every legend on the page cannot be misread as a series.
 *
 * Validated at the same 71%, composited over each theme's surface:
 *   light #9766e4 · dark #7b69be — band, chroma and contrast all PASS in both.
 */
const BAR_FILL = "bg-accent-violet-fg/71";

const NUMBER = new Intl.NumberFormat("en-IN");

export type ColumnDatum = {
  /** `YYYY-MM-DD`, the local calendar bucket the API already computed. */
  bucket: string;
  values: Record<string, number>;
  total: number;
};

/**
 * Stacked columns over time.
 *
 * Stacked, not grouped, because the segments genuinely sum to the total: every
 * report has exactly one effective status, so completed + open + expired is the
 * whole of that day's reports and the column height means something.
 */
export function StackedColumnChart({
  data,
  series,
  emptyMessage,
}: {
  data: ColumnDatum[];
  series: readonly ChartSeries[];
  emptyMessage: string;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-fg-faint">{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((datum) => datum.total), 1);
  // Past ~14 columns the per-column totals collide into each other, so they
  // move to the hover layer rather than overlapping into unreadability.
  const showTotals = data.length <= 14;
  // Keep roughly ten x labels whatever the range, so a 90-day view still has a
  // readable axis instead of a grey smear.
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div>
      {/*
        NO `overflow-x-auto` HERE, deliberately.

        Setting `overflow-x` makes `overflow-y` compute to `auto` rather than
        `visible` — so a scroll box would clip everything drawn outside the plot
        area: the x-axis labels below each column and the hover tooltip above
        it. (The same CSS fact `data-table.tsx` relies on for its sticky header,
        biting from the other direction.) Columns shrink to fit instead, which
        they can do down to 3px — ninety daily buckets still fit across the card.
      */}
      <div className="flex items-stretch gap-[3px]">
        {data.map((datum, index) => {
          const heightPercent = (datum.total / max) * 100;
          return (
            <div
              key={datum.bucket}
              // `max-w` matters at the sparse end: five buckets across a wide
              // card would otherwise stretch into 200px slabs, which reads as a
              // different chart type. Capped, they stay columns.
              className="group relative flex min-w-[3px] max-w-24 flex-1 flex-col"
            >
              <span className="tabular h-4 text-center text-[10px] leading-4 text-fg-faint">
                {showTotals && datum.total > 0 ? datum.total : ""}
              </span>

              {/* The plot area. Fixed height so every column shares a baseline. */}
              <div className="flex flex-col justify-end" style={{ height: "160px" }}>
                <div
                  // Rounded at the data end only; the baseline stays square so
                  // the columns sit on a common line rather than floating.
                  className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                  style={{ height: `${heightPercent}%` }}
                >
                  {series.map((entry) => {
                    const value = datum.values[entry.key] ?? 0;
                    // A zero segment is omitted, not rendered flat: a 0-height
                    // div still eats a 2px gap and draws a hairline that reads
                    // as data.
                    if (value <= 0) return null;
                    return (
                      <div
                        key={entry.key}
                        className={cn("min-h-px w-full", entry.fill)}
                        style={{ flexGrow: value, flexBasis: 0 }}
                      />
                    );
                  })}
                </div>
              </div>

              <span
                className={cn(
                  "mt-1 h-4 truncate text-center text-[10px] leading-4 text-fg-faint",
                  index % labelEvery === 0 ? "" : "invisible",
                )}
              >
                {shortDate(datum.bucket)}
              </span>

              <Tooltip datum={datum} series={series} />
            </div>
          );
        })}
      </div>

      <Legend series={series} />

      {/* The table view the contrast WARN obliges, and the only way a screen
          reader gets these numbers at all — a stack of coloured divs conveys
          nothing without it. */}
      <table className="sr-only">
        <caption>Reports per day by outcome</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((entry) => (
              <th key={entry.key} scope="col">
                {entry.label}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.bucket}>
              <th scope="row">{datum.bucket}</th>
              {series.map((entry) => (
                <td key={entry.key}>{datum.values[entry.key] ?? 0}</td>
              ))}
              <td>{datum.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Hover detail. CSS-only: no state, no listeners, and it survives keyboard
 * focus via `focus-within` on the column.
 */
function Tooltip({ datum, series }: { datum: ColumnDatum; series: readonly ChartSeries[] }) {
  return (
    <span
      role="presentation"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 rounded-control border border-border bg-surface px-2.5 py-2 whitespace-nowrap shadow-popover group-hover:block group-focus-within:block"
    >
      <span className="block text-[11px] font-bold text-fg">{shortDate(datum.bucket, true)}</span>
      {series.map((entry) => (
        <span key={entry.key} className="mt-1 flex items-center gap-1.5 text-[10px]">
          <span className={cn("size-2 shrink-0 rounded-[2px]", entry.fill)} aria-hidden />
          {/* Text wears text tokens; the swatch beside it carries the identity. */}
          <span className="text-fg-subtle">{entry.label}</span>
          <span className="tabular ml-auto pl-2 font-semibold text-fg">
            {datum.values[entry.key] ?? 0}
          </span>
        </span>
      ))}
      <span className="mt-1.5 flex items-center gap-1.5 border-t border-border pt-1.5 text-[10px]">
        <span className="text-fg-subtle">Total</span>
        <span className="tabular ml-auto pl-2 font-semibold text-fg">{datum.total}</span>
      </span>
    </span>
  );
}

function Legend({ series }: { series: readonly ChartSeries[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((entry) => (
        <li key={entry.key} className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <span className={cn("size-2.5 shrink-0 rounded-[2px]", entry.fill)} aria-hidden />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

export type BarDatum = {
  key: string;
  label: ReactNode;
  value: number;
  /** Muted second line — a breakdown, a caveat. */
  detail?: ReactNode;
};

/**
 * Ranked magnitude, one row per item.
 *
 * A single series, so colour encodes nothing and no legend is needed — the row
 * label is the identity. The number sits beside every bar rather than only on
 * hover, which is what lets the fill be a quiet tint instead of a loud block.
 */
export function BarList({
  data,
  emptyMessage,
  valueLabel,
}: {
  data: BarDatum[];
  emptyMessage: string;
  /** Screen-reader unit, e.g. "reports". */
  valueLabel: string;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-fg-faint">{emptyMessage}</p>;
  }

  // Scaled to the largest row, not to the total: this compares items with each
  // other, and scaling to a sum would flatten every bar into a sliver.
  const max = Math.max(...data.map((datum) => datum.value), 1);

  return (
    <ol className="space-y-2.5">
      {data.map((datum) => (
        <li key={datum.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-xs font-semibold text-fg">{datum.label}</span>
            <span className="tabular shrink-0 text-xs font-bold text-fg">
              {NUMBER.format(datum.value)}
              <span className="sr-only"> {valueLabel}</span>
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-[2px] bg-surface-3">
            <div
              className={cn("h-full rounded-r-[4px]", BAR_FILL)}
              style={{ width: `${(datum.value / max) * 100}%` }}
            />
          </div>
          {datum.detail ? (
            <p className="mt-1 text-[11px] text-fg-faint">{datum.detail}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** `2026-08-24` -> `24 Aug`, or `24 Aug 2026` when the year matters. */
function shortDate(bucket: string, withYear = false): string {
  const date = new Date(`${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

/**
 * Turning the API's `{ total, completed, expired }` into stackable segments.
 *
 * The three numbers the endpoint returns are NOT a stack: `total` is the whole,
 * and `completed` + `expired` are two parts of it. Stacking all three would
 * double-count and draw columns taller than the day's real report count.
 *
 * The missing third segment — reports still open, or closed without completing —
 * is `total - completed - expired`. Every report has exactly one effective
 * status, so that subtraction is exact rather than an estimate, and the three
 * segments then genuinely sum to the column height. Clamped at zero anyway: a
 * negative segment would be a silent rendering bug rather than a visible one.
 */
export const ColumnDatumHelpers = {
  fromReportBucket(row: {
    bucket: string;
    total: number;
    completed: number;
    expired: number;
  }): ColumnDatum {
    const open = Math.max(0, row.total - row.completed - row.expired);
    return {
      bucket: row.bucket,
      total: row.total,
      values: { completed: row.completed, open, expired: row.expired },
    };
  },
};
