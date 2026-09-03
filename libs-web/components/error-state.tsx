"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/cn";

/**
 * A load that failed.
 *
 * This is the correct surface for a failed query — never a toast. A toast
 * vanishes and leaves the operator staring at a blank content area with no way
 * to retry and no idea what happened.
 *
 * `digest` is the server-side error id. Always surface it: it is the only
 * handle support has to find the matching log line.
 */
export function ErrorState({
  title = "Couldn't load this",
  message,
  digest,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  digest?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-danger-soft-border bg-danger-soft/40 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-control bg-danger-soft text-danger-fg">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="mt-4 text-sm font-bold text-fg">{title}</h3>
      {message ? <p className="mt-1 max-w-md text-fg-subtle">{message}</p> : null}
      {digest ? (
        <p className="mt-3 font-mono text-[11px] text-fg-faint">
          Reference: <span className="text-fg-muted">{digest}</span>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-5">
          <RotateCcw />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
