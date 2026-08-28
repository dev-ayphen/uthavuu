import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The accent families a data tile may use. Every one is defined in BOTH themes
 * in globals.css, so a tile never has to reach for a `dark:` override.
 */
export type Accent = "emerald" | "blue" | "amber" | "rose" | "violet" | "cyan" | "pink" | "slate";

const ACCENT: Record<Accent, { fg: string; soft: string; border: string }> = {
  emerald: {
    fg: "text-accent-emerald-fg",
    soft: "bg-accent-emerald-soft",
    border: "border-accent-emerald-soft-border",
  },
  blue: {
    fg: "text-accent-blue-fg",
    soft: "bg-accent-blue-soft",
    border: "border-accent-blue-soft-border",
  },
  amber: {
    fg: "text-accent-amber-fg",
    soft: "bg-accent-amber-soft",
    border: "border-accent-amber-soft-border",
  },
  rose: {
    fg: "text-accent-rose-fg",
    soft: "bg-accent-rose-soft",
    border: "border-accent-rose-soft-border",
  },
  violet: {
    fg: "text-accent-violet-fg",
    soft: "bg-accent-violet-soft",
    border: "border-accent-violet-soft-border",
  },
  cyan: {
    fg: "text-accent-cyan-fg",
    soft: "bg-accent-cyan-soft",
    border: "border-accent-cyan-soft-border",
  },
  pink: {
    fg: "text-accent-pink-fg",
    soft: "bg-accent-pink-soft",
    border: "border-accent-pink-soft-border",
  },
  slate: {
    fg: "text-accent-slate-fg",
    soft: "bg-accent-slate-soft",
    border: "border-accent-slate-soft-border",
  },
};

/** The large headline metric — four across the top of the dashboard. */
export function StatCard({
  label,
  value,
  sublabel,
  note,
  icon: Icon,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  note?: string;
  icon: LucideIcon;
  accent?: Accent;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-card border bg-surface p-4 shadow-card",
        a.border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex size-9 items-center justify-center rounded-control", a.soft)}>
          <Icon className={cn("size-4.5", a.fg)} />
        </span>
        {note ? (
          <span className="rounded-pill border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-subtle">
            {note}
          </span>
        ) : null}
      </div>
      <div className="mt-5">
        <div className="tabular text-3xl leading-none font-extrabold tracking-tight text-fg">
          {value}
        </div>
        <div className="mt-1.5 text-xs font-bold text-fg">{label}</div>
        {sublabel ? <div className="mt-0.5 text-[11px] text-fg-faint">{sublabel}</div> : null}
      </div>
    </div>
  );
}

/** The compact counter — eight across, below the headline row. */
export function MetricTile({
  label,
  value,
  icon: Icon,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: Accent;
}) {
  const a = ACCENT[accent];
  return (
    <div className="flex flex-col justify-between rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] leading-tight font-semibold text-fg-faint">{label}</span>
        <Icon className={cn("size-3.5 shrink-0", a.fg)} />
      </div>
      <div className={cn("tabular mt-2 text-xl font-extrabold", a.fg)}>{value}</div>
    </div>
  );
}
