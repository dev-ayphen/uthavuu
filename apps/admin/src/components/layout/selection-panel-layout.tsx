import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Master-detail: a list panel beside a detail pane.
 *
 * SCROLL — Mode B (inner scroll). The panel and the detail scroll
 * independently, so each gets its own bounded scroller and neither bubbles to
 * the document. Same three rules as SubMenuPageLayout: bounded root height in
 * `svh`, `min-h-0` on every scrolling flex child, `shrink-0` on the pane that
 * must hold its width.
 *
 * A header placed inside a scroll pane uses `sticky top-0` — it sticks to the
 * pane, not to the viewport.
 */
export function SelectionPanelLayout({
  panelHeader,
  panel,
  children,
  panelWidthClassName = "w-80",
}: {
  /** Pinned to the top of the list panel while the list scrolls beneath it. */
  panelHeader?: ReactNode;
  panel: ReactNode;
  children: ReactNode;
  panelWidthClassName?: string;
}) {
  return (
    <div className="flex h-[var(--app-content-height)] flex-col">
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden shrink-0 flex-col overflow-hidden border-r border-border bg-surface lg:flex",
            panelWidthClassName,
          )}
        >
          {panelHeader ? (
            <div className="shrink-0 border-b border-border px-3 py-3">{panelHeader}</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">{panel}</div>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto scrollbar-slim">
          <div className="px-[var(--page-padding-inline)] py-[var(--page-padding-block)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
