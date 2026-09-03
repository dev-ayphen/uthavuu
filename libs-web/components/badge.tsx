import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-pill border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-neutral-soft-border bg-neutral-soft text-neutral-fg",
        success: "border-success-soft-border bg-success-soft text-success-fg",
        warning: "border-warning-soft-border bg-warning-soft text-warning-fg",
        danger: "border-danger-soft-border bg-danger-soft text-danger-fg",
        info: "border-info-soft-border bg-info-soft text-info-fg",
        primary: "border-primary-soft-border bg-primary-soft text-primary-soft-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** The sidebar's count chip — fixed min width so single and double digits align. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <Badge tone="danger" className={cn("tabular min-w-5 px-1.5", className)}>
      {count}
    </Badge>
  );
}
