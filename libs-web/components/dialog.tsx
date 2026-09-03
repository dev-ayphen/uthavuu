"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * The modal, built on the native `<dialog>` element.
 *
 * Promoted here from `apps/admin/src/features/moderation/dialog.tsx`, which was
 * the only modal in the console and was therefore imported across five features
 * that had nothing to do with moderation. Nothing below knows about routes,
 * sessions or permissions — it is a token consumer, which is the entry test for
 * this package.
 *
 * WHY NATIVE AND NOT A PORTAL
 * ───────────────────────────────────────────────────────────────────────────
 * `showModal()` gives four behaviours a hand-rolled portal has to re-implement
 * and usually gets wrong: focus moves into the dialog and is trapped there,
 * everything behind it becomes inert (so a stray Tab cannot reach the table
 * underneath and a screen reader cannot read it), Escape closes it, and the top
 * layer means no `z-index` fight with the fixed header and sidebar. None of
 * that costs a dependency.
 *
 * The two things it does NOT give, both handled below:
 *   - Escape fires a `cancel` event, not a React state change. Left alone, the
 *     element closes while `open` stays true and can never reopen.
 *   - A click on the backdrop lands on the <dialog> itself, because the
 *     backdrop is its pseudo-element. Comparing the target to the element is
 *     what separates "clicked outside" from "clicked the panel".
 *
 * WHY THE CONTENTS ARE UNMOUNTED WHILE CLOSED
 * ───────────────────────────────────────────────────────────────────────────
 * This is what lets everything inside hold state without a reset-on-close
 * effect. A half-typed reason, a validation error, a failed request — all of it
 * is created fresh on the next open because the subtree is new, rather than
 * being scrubbed by an effect that fires after a render nobody wanted. The
 * `<dialog>` ELEMENT itself stays mounted: removing an open dialog from the DOM
 * to reset it would be taking the top layer down with it.
 */
export function Dialog({
  open,
  onClose,
  children,
  dismissible = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Compose from DialogHeader / DialogBody / DialogFooter. */
  children: ReactNode;
  /** False while a request is in flight: Escape and the backdrop stop working. */
  dismissible?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Always prevent: React owns `open`, so letting the browser close the
        // element behind React's back desynchronises the two.
        event.preventDefault();
        // Dialogs nest — a confirmation opens on top of the comment it is about
        // — and browsers disagree about whether `cancel` bubbles. Stopping it
        // here means one Escape closes one dialog, in every browser.
        event.stopPropagation();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (!dismissible) return;
        // The backdrop IS the dialog, so a click on the panel bubbles here too.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        // The UA stylesheet centres a <dialog> with `margin: auto`, gives it a
        // border and a white background, and caps its size. All of that is
        // overridden so the panel below is the only thing that paints.
        "m-auto max-h-[min(42rem,calc(100svh-4rem))] w-[min(34rem,calc(100vw-2rem))] border-0 bg-transparent p-0",
        "backdrop:bg-overlay backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {open ? (
        // `text-left` is not a default being restated. A dialog is opened from
        // wherever its trigger lives, and on Comments and Flagged that is an
        // `align: "end"` table cell — which carries `text-right`. The top layer
        // changes where a <dialog> PAINTS, not where it sits in the DOM, so
        // inherited properties still come from that cell and every line in the
        // panel came out right-aligned. Anchoring the alignment here means the
        // dialog reads the same wherever it is triggered from.
        <div className="flex max-h-[inherit] flex-col overflow-hidden rounded-card border border-border bg-surface text-left text-fg shadow-popover">
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function DialogHeader({
  title,
  titleId,
  description,
  onClose,
  dismissible = true,
}: {
  title: string;
  /** Wired to the form's `aria-labelledby` so the modal announces its purpose. */
  titleId?: string;
  description?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 id={titleId} className="text-sm font-bold text-fg">
          {title}
        </h2>
        {description ? <div className="mt-1 text-xs text-fg-subtle">{description}</div> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={!dismissible}
        aria-label="Close"
        className="-mr-1 shrink-0 rounded-control p-1 text-fg-faint transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** The one scroller in the panel. `min-h-0` is what lets it be one. */
export function DialogBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 py-4">{children}</div>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-border bg-surface-2 px-5 py-3">{children}</div>
  );
}
