import type { ReactNode } from "react";

import { Card } from "./card";
import { cn } from "../lib/cn";

/** Structurally what every lucide icon is, without depending on lucide's own type. */
type Glyph = (props: { className?: string; "aria-hidden"?: boolean }) => ReactNode;

/**
 * A tinted card carrying one consequential fact about the record on screen:
 * this report is hidden, this admin is the last super admin.
 *
 * WHY NOT `Alert`
 * ───────────────────────────────────────────────────────────────────────────
 * Same vocabulary of tones, different job and different weight. `Alert` is a
 * strip reporting what just happened — a submit failed, a note about the action
 * you are about to take — and it lives inside a form. This is part of the
 * RECORD: it was true before the operator arrived, it stays true, and it needs
 * the same card shell as the sections around it or it reads as an interruption
 * rather than as content. Hence a `Card`, an icon tile rather than an inline
 * glyph, and no `role="alert"` anywhere — announcing a standing fact on every
 * page load is noise, and the heading already said it.
 *
 * THE MARKUP IS THE DETAIL PAGES' MARKUP, UNCHANGED
 * ───────────────────────────────────────────────────────────────────────────
 * `min-w-0 text-xs` on the body column, `mt-1` between the two lines, `size-7
 * shrink-0` on the tile. Two pages had drawn exactly this by hand. A third —
 * `features/users/user-detail.tsx` — draws something that only looks similar:
 * its icon and title share one row above a `<dl>`, and its tile has lost its
 * `shrink-0`. It is deliberately NOT folded in here. Reshaping it to fit would
 * change what is on screen, and adding a variant for a layout with one user is
 * how a component starts collecting knobs instead of callers.
 */

const TONE = {
  danger: { border: "border-danger-soft-border", tile: "bg-danger-soft text-danger-fg" },
  warning: { border: "border-warning-soft-border", tile: "bg-warning-soft text-warning-fg" },
  info: { border: "border-info-soft-border", tile: "bg-info-soft text-info-fg" },
  success: { border: "border-success-soft-border", tile: "bg-success-soft text-success-fg" },
  neutral: { border: "border-border", tile: "bg-surface-3 text-fg-muted" },
} as const;

export type CalloutTone = keyof typeof TONE;

export function CalloutCard({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  /** The lucide COMPONENT, so the tile applies the size rather than the caller. */
  icon: Glyph;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const style = TONE[tone];

  return (
    <Card className={cn(style.border, className)}>
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            // `shrink-0` is load-bearing: without it a long body squeezes the
            // tile into an ellipse. One page has already lost it.
            "flex size-7 shrink-0 items-center justify-center rounded-control",
            style.tile,
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 text-xs">
          <h3 className="text-sm font-bold text-fg">{title}</h3>
          {children ? <p className="mt-1 text-fg-subtle">{children}</p> : null}
        </div>
      </div>
    </Card>
  );
}
