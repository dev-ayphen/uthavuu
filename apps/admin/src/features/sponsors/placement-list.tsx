import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

import {
  orderPlacements,
  placementDelivery,
  placementLabel,
  placementRendersNowhere,
} from "./placements";

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
 * A PLACEMENT THE APP DOES NOT RENDER GETS THE SAME TREATMENT, for the same
 * reason. `community_impact` is accepted by the API and mounted by no screen in
 * `apps/mobile` (checked 2026-09-02 — see ./placements.ts), so a badge that
 * looked like the other three would make an undeliverable campaign read as a
 * configured one. It is shown in warning tone rather than hidden: hiding it
 * would let an operator "fix" the row by re-ticking boxes and silently drop the
 * key on save.
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

  const { showsNowhere } = placementDelivery(placements);

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {orderPlacements(placements).map((placement) => {
        const undelivered = placementRendersNowhere(placement);
        return (
          <Badge
            key={placement}
            tone={undelivered ? "warning" : "neutral"}
            title={
              undelivered
                ? `${placementLabel(placement)} is accepted by the API but no screen in the mobile app renders it yet, so nothing appears there.`
                : undefined
            }
          >
            {placementLabel(placement)}
          </Badge>
        );
      })}
      {/* Said in words, not left to the badge colour: every placement on this
          campaign is undeliverable, so the row is not "partly configured" — it
          is a campaign no citizen can reach. */}
      {showsNowhere ? (
        <span className="block w-full text-[11px] text-warning-fg">
          No app screen renders {placements.length === 1 ? "this" : "any of these"} yet
        </span>
      ) : null}
    </span>
  );
}
