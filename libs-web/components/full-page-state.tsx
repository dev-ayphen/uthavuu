import type { ReactNode } from "react";

import { cn } from "../lib/cn";

/** Structurally what every lucide icon is, without depending on lucide's own type. */
type Glyph = (props: { className?: string; "aria-hidden"?: boolean }) => ReactNode;

/**
 * A whole screen that is not the screen anyone asked for: a crashed segment,
 * a 404, a render throw that escaped every route boundary.
 *
 * WHAT THIS REPLACES
 * ───────────────────────────────────────────────────────────────────────────
 * Three copies of the same centred card — `app/error.tsx`, `app/not-found.tsx`,
 * and the provider tree's `ErrorBoundary` fallback. These are the screens an
 * operator sees on the worst day, and drift between them reads as the console
 * being even more broken than it is.
 *
 * EVERYTHING BELOW THE DESCRIPTION IS `children`, ON PURPOSE
 * ───────────────────────────────────────────────────────────────────────────
 * The three call sites end differently — one shows a digest then a full-width
 * retry, one a plain link, one a `<pre>` of the error message — and they space
 * those endings differently too (`mt-4`, `mt-5`). Modelling that as `digest` /
 * `detail` / `actions` props would force one spacing on all three, which is a
 * change to what is on screen. The shared part is the frame: the grid, the
 * card, the tile, the heading pair. That is all this owns.
 *
 * `global-error.tsx` DELIBERATELY DOES NOT USE THIS. It replaces the root
 * layout, so the stylesheet has not necessarily loaded and it cannot depend on
 * a Tailwind class existing — it carries inline styles instead. That copy is
 * justified; the other two were not.
 */
export function FullPageState({
  icon: Icon,
  tone = "danger",
  title,
  description,
  /** Centres the card's text and the icon tile — the 404's treatment. */
  centered = false,
  children,
  className,
}: {
  icon: Glyph;
  /** The tile's tint. `danger` for a fault, `neutral` for an expected dead end. */
  tone?: "danger" | "neutral";
  title: ReactNode;
  description?: ReactNode;
  centered?: boolean;
  /** Digest, technical detail, actions — with their own spacing. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-svh place-items-center bg-canvas p-6", className)}>
      <div
        className={cn(
          "w-full max-w-md rounded-panel border border-border bg-surface p-6 shadow-raised",
          centered && "text-center",
        )}
      >
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-control",
            tone === "danger" ? "bg-danger-soft text-danger-fg" : "bg-neutral-soft text-neutral-fg",
            centered && "mx-auto",
          )}
        >
          <Icon className="size-5" />
        </div>
        <h1 className="mt-4 text-base font-bold text-fg">{title}</h1>
        {description ? <p className="mt-1.5 text-fg-subtle">{description}</p> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * The server-side error id, in the one format support looks for.
 *
 * Always surface it. It is the only handle anyone has to find the matching log
 * line, and an operator who cannot quote it turns a two-minute lookup into an
 * open-ended hunt.
 */
export function ErrorReference({ digest, className }: { digest: string; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] text-fg-faint", className)}>
      Reference: <span className="text-fg-muted">{digest}</span>
    </p>
  );
}
