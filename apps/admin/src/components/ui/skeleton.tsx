import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * A loading placeholder. Size it to the shape it stands in for — a skeleton
 * that does not match the loaded layout causes a shift the moment data lands,
 * which is worse than showing nothing.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-control bg-surface-3", className)}
      {...props}
    />
  );
}
