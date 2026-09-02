"use client";

import Link from "next/link";
import type { Route } from "next";
import { MoreVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

/**
 * The row-level `⋮` menu, built on the native Popover API.
 *
 * WHY NATIVE, AND WHY THE SAME REASONING AS `features/moderation/dialog.tsx`
 * ───────────────────────────────────────────────────────────────────────────
 * That file chose `<dialog showModal()>` over a hand-rolled portal and wrote
 * down why: the platform already implements the top layer, light dismiss and
 * escape handling, and re-implementing them is where hand-rolled overlays go
 * wrong. A menu needs three of the same four things, so it gets the same answer
 * rather than a third idiom:
 *
 *   TOP LAYER      This menu opens from a cell inside `DataTable`'s
 *                  `overflow-x-auto` scroll box, beneath a `sticky z-30` page
 *                  header and a `fixed z-50` app header. In the top layer there
 *                  is no z-index fight to lose and no ancestor to be clipped by.
 *   LIGHT DISMISS  `popover="auto"` closes on a click anywhere else and on
 *                  Escape, and closes any other open popover first — so two
 *                  rows' menus can never be open at once.
 *   FOCUS RETURN   Hiding a popover returns focus to where it came from.
 *
 * It does NOT get `<dialog>`'s focus trap or `inert`, and should not: a menu is
 * not modal, and trapping focus in one is a well-known way to strand a keyboard
 * user. Arrow-key navigation between items is implemented below, because that
 * is the one menu behaviour the platform does not provide.
 *
 * WHAT THE PLATFORM STILL DOESN'T DO: POSITION IT
 * ───────────────────────────────────────────────────────────────────────────
 * CSS anchor positioning would, and is not portable enough to rely on, so the
 * menu is placed by hand against the trigger's rect in a LAYOUT effect — before
 * paint, so it is never seen at the UA's default centred position first. It
 * flips above the trigger when there is no room below and is clamped to the
 * viewport on both axes, which matters because the last row of a long table is
 * exactly where an operator opens this most often.
 *
 * GRACEFUL DEGRADATION
 * ───────────────────────────────────────────────────────────────────────────
 * A browser with no Popover API gets a trigger that does nothing rather than a
 * thrown TypeError. That is survivable here and nowhere else in the flow,
 * because every action in this menu also exists as a plain button on the
 * account's detail page, and the row's name cell is a real `<Link>` to it.
 */

export type MenuAction = {
  /** Stable id, used as the React key. */
  id: string;
  label: string;
  icon?: ReactNode;
  /**
   * Navigation target. Renders a real `<a>` rather than a button, so the item
   * keeps ⌘-click, middle-click and the status-bar URL preview — the same
   * reasoning `DataTable` gives for putting a real `<Link>` in its primary
   * cell instead of a scripted row click. Mutually exclusive with `onSelect`.
   */
  href?: Route;
  onSelect?: () => void;
  tone?: "default" | "danger";
  /**
   * Why this cannot be done. Present = the item renders disabled, with this
   * text as BOTH its tooltip and a visible line beneath the label.
   *
   * It is never a reason to hide the item. An operator who cannot see that
   * "Suspend" exists concludes the console is broken or that they misremembered
   * where it was; one who sees it greyed out with a sentence attached learns
   * the rule. That is also why these stay focusable (`aria-disabled`, not
   * `disabled`): a `disabled` button is skipped by the keyboard and its
   * `title` never appears, so the explanation would be mouse-only.
   */
  disabledReason?: string;
  /** Draws a divider above this item — for the destructive tail of the menu. */
  separated?: boolean;
};

const GAP = 6;
const EDGE = 8;
/** Matches `w-64` below. Only used before the menu has ever been measured. */
const ESTIMATED_WIDTH = 256;

export function ActionMenu({
  label,
  actions,
  className,
}: {
  /** Accessible name for the trigger, e.g. `Actions for Priya Raman`. */
  label: string;
  actions: readonly MenuAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /**
   * True while closing BECAUSE an item was chosen. Focus is then left alone:
   * the chosen action opens a dialog which moves focus itself, and racing it
   * back to the trigger would drop the operator behind the dialog they asked
   * for.
   */
  const selecting = useRef(false);
  const menuId = useId();

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const anchor = trigger.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const width = box.width || ESTIMATED_WIDTH;
    const height = box.height;

    // Below the trigger, flipping above only when there is genuinely no room —
    // the bottom rows of a table are where this matters.
    let top = anchor.bottom + GAP;
    if (height > 0 && top + height > window.innerHeight - EDGE) {
      const above = anchor.top - GAP - height;
      top = above >= EDGE ? above : Math.max(EDGE, window.innerHeight - EDGE - height);
    }

    // Right-aligned to the trigger: the menu lives in an `align: "end"` cell,
    // so growing leftward keeps it over the table instead of off the edge.
    let left = anchor.right - width;
    left = Math.min(left, window.innerWidth - width - EDGE);
    left = Math.max(EDGE, left);

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  }, []);

  // Open/close the popover, then place and focus it — all before paint, so the
  // menu is never visible at the UA stylesheet's centred default position.
  //
  // `useLayoutEffect` warns when a component renders on the SERVER, and this one
  // never can: it only exists inside a `DataTable` row, and rows only exist
  // after `useListQuery` has resolved in the browser. During SSR the table is in
  // its `loading` branch and no menu is mounted. If this component is ever
  // rendered somewhere server-reachable, that warning is the thing to read.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || typeof menu.showPopover !== "function") return;

    if (open) {
      if (!menu.matches(":popover-open")) menu.showPopover();
      place();
      menu.querySelector<HTMLElement>("[data-menu-item]")?.focus();
      return;
    }

    if (menu.matches(":popover-open")) menu.hidePopover();
  }, [open, place]);

  // The browser can close this without asking React — Escape, a click outside,
  // or another popover opening. Without this the element would be hidden while
  // `open` stayed true, and the trigger would appear dead forever after.
  //
  // This is also the single place focus is restored, so every close path — key,
  // click, another menu opening — behaves identically.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const onToggle = (event: Event) => {
      const state = (event as Event & { newState?: string }).newState;
      if (state !== "closed") return;
      setOpen(false);
      if (!selecting.current) triggerRef.current?.focus();
      selecting.current = false;
    };

    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, []);

  // A fixed-position menu does not travel with the page or the table's own
  // horizontal scroll box, so it is re-placed rather than left hanging beside
  // the row it belongs to. `capture` catches scrolls on inner boxes too.
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

  const select = (action: MenuAction) => {
    if (action.disabledReason || !action.onSelect) return;
    // Read and cleared by the `toggle` listener above, which is the only thing
    // that moves focus. It has to outlive this handler: `hidePopover()` happens
    // in the layout effect and the toggle event is queued after that.
    selecting.current = true;
    setOpen(false);
    action.onSelect();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;

    if (event.key === "Tab") {
      // A menu is not a form. Tab means "I'm done here", not "next item".
      // Focus goes back to the trigger via the `toggle` listener.
      event.preventDefault();
      setOpen(false);
      return;
    }

    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const items = [...menu.querySelectorAll<HTMLElement>("[data-menu-item]")];
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = current;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;

    items[next]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fg-faint",
          "transition-colors hover:bg-surface-2 hover:text-fg",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          open && "bg-surface-2 text-fg",
          className,
        )}
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>

      <div
        ref={menuRef}
        id={menuId}
        // `auto`, not `manual`: this is what buys light dismiss (a click
        // anywhere else, Escape) and the guarantee that opening one row's menu
        // closes another's.
        popover="auto"
        role="menu"
        aria-label={label}
        onKeyDown={onMenuKeyDown}
        className={cn(
          // `inset-auto m-0` overrides the UA stylesheet, which centres an open
          // popover with `inset: 0; margin: auto`. Without it the menu would
          // appear in the middle of the screen for one frame and then jump.
          // `p-0` then `py-1`: the UA stylesheet gives an open popover `1em` of
          // padding and a border, both of which have to go before the panel
          // below is the only thing that paints.
          "fixed inset-auto m-0 w-64 overflow-visible p-0 py-1",
          "rounded-card border border-border bg-surface text-fg shadow-popover",
          // The dialog file learned this the hard way: the top layer changes
          // where an element PAINTS, not where it sits in the DOM, so inherited
          // properties still come from the `align: end` table cell that
          // triggered it — which carries `text-right`.
          "text-left",
        )}
      >
        {/* Items are DIRECT children of the `role="menu"` element. A wrapper
            div between them would break the menu -> menuitem ownership ARIA
            requires, and the padding it existed for lives on the menu instead. */}
        {actions.map((action) => (
          <MenuItem
            key={action.id}
            action={action}
            onSelect={() => select(action)}
            // A link navigates away; the menu must not be left open behind the
            // new page, and focus must not be dragged back to a trigger that no
            // longer exists.
            onNavigate={() => {
              selecting.current = true;
              setOpen(false);
            }}
          />
        ))}
      </div>
    </>
  );
}

function MenuItem({
  action,
  onSelect,
  onNavigate,
}: {
  action: MenuAction;
  onSelect: () => void;
  onNavigate: () => void;
}) {
  const disabled = Boolean(action.disabledReason);

  const className = cn(
    "flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs font-medium",
    "outline-none transition-colors",
    disabled
      ? "cursor-not-allowed text-fg-faint"
      : action.tone === "danger"
        ? "text-danger-fg hover:bg-danger-soft focus-visible:bg-danger-soft"
        : "text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:bg-surface-2 focus-visible:text-fg",
    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  );

  const body = (
    <>
      <span className="mt-px shrink-0 [&_svg]:size-3.5" aria-hidden>
        {action.icon}
      </span>
      <span className="min-w-0">
        <span className="block">{action.label}</span>
        {action.disabledReason ? (
          // The tooltip is required, but a tooltip alone is mouse-only and
          // vanishes. The rule is worth reading, so it is also on screen.
          <span className="mt-0.5 block text-[11px] leading-snug font-normal text-fg-faint">
            {action.disabledReason}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <>
      {action.separated ? <div className="my-1 h-px bg-border" role="none" /> : null}
      {action.href && !disabled ? (
        <Link
          href={action.href}
          role="menuitem"
          data-menu-item
          tabIndex={-1}
          onClick={onNavigate}
          className={className}
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          role="menuitem"
          data-menu-item
          // Focusable on purpose while disabled — see `disabledReason`.
          tabIndex={-1}
          aria-disabled={disabled || undefined}
          title={action.disabledReason}
          onClick={onSelect}
          className={className}
        >
          {body}
        </button>
      )}
    </>
  );
}
