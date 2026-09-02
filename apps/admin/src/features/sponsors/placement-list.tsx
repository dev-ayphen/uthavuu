import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

import { orderPlacements, placementLabel } from "./placements";

/**
 * Which surfaces a campaign appears on.
 *
 * ZERO PLACEMENTS IS CALLED OUT, NOT LEFT BLANK. A sponsor with no placements
 * is stored happily — the only NOT NULL field on the table is the name — and it
 * renders to nobody. That is the quietest way for a campaign to fail: it looks
 * configured, its status says Active, and it is on no screen in the product.
 * An em-dash here would read as "nothing to report"; the warning tone says what
 * is actually true.
 *
 * Unknown keys still render, via `placementLabel`'s fallback to the raw key. See
 * ./placements.ts for why hiding one would be worse than showing it ugly.
 */
export function PlacementList({
  placements,
  className,
}: {
  placements: string[];
  className?: string;
}) {
  if (placements.length === 0) {
    return (
      <span className={className}>
        <span className="text-warning-fg">Shows nowhere</span>
      </span>
    );
  }

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {orderPlacements(placements).map((placement) => (
        <Badge key={placement} tone="neutral">
          {placementLabel(placement)}
        </Badge>
      ))}
    </span>
  );
}
