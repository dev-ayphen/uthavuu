import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Zero data. Distinct from ErrorState: this means "nothing here yet", never
 * "we could not load it". An empty screen is an invitation to act, so give it
 * an action whenever one exists.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface/50 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-4 text-fg-faint">{icon}</div> : null}
      <h3 className="text-sm font-bold text-fg">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-fg-subtle">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
