import { Card, CardBody, CardHeader, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PanelBodySkeleton } from "./panel";

/**
 * The dashboard's shape, before it has any numbers in it.
 *
 * Shared by the segment's `loading.tsx` and by the page's own pending branch so
 * the two cannot drift: four headline cards, eight compact tiles, then the
 * activity panel with the two narrower panels beside it. Every height here
 * matches the loaded element it stands in for — a skeleton that does not is
 * worse than none, because the whole page jumps the moment data lands.
 *
 * The side panels are built from the SAME primitives the real panels use
 * (Card + PanelRowSkeleton at the same bounded height), so a change to a panel
 * cannot leave this behind.
 */
export function DashboardSkeleton({
  /**
   * How many of the two side panels this admin will actually get. The panels
   * are permission-gated (features/dashboard/permission.ts), and reserving
   * space for a panel that never arrives leaves a hole in the layout.
   *
   * `loading.tsx` cannot know the answer — it renders before the session is
   * resolved — so it takes the default. The page's own pending branch, which
   * has been told, passes the real number.
   */
  sidePanels = 2,
}: {
  sidePanels?: 0 | 1 | 2;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.75rem] rounded-card" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton
          className={cn(
            "h-[26rem] max-h-[80svh] rounded-card",
            // With no side panels the feed takes the whole row, exactly as the
            // loaded page does — otherwise the skeleton promises a column that
            // this admin is never going to be shown.
            sidePanels === 0 ? "lg:col-span-3" : "lg:col-span-2",
          )}
        />
        {sidePanels > 0 ? (
          <div className="grid content-start gap-4">
            {Array.from({ length: sidePanels }).map((_, i) => (
              <PanelCardSkeleton key={i} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One side panel: a title bar, three rows and the footnote line every loaded
 * panel ends with — at the same bounds the real panels use, so the card is the
 * same height before and after the data lands.
 */
function PanelCardSkeleton() {
  return (
    <Card className="flex min-h-[12.5rem] max-h-[18rem] flex-col">
      <CardHeader className="shrink-0">
        <Skeleton className="h-3.5 w-40" />
      </CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col px-0 pb-3">
        <PanelBodySkeleton />
      </CardBody>
    </Card>
  );
}
