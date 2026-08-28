import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { ANALYTICS_LIST } from "@/features/analytics/use-analytics";
import { AnalyticsView, AnalyticsViewSkeleton } from "@/features/analytics/analytics-view";

export const metadata = { title: "Analytics" };

/**
 * Analytics is its own route with no sub-menu, so THIS page composes the frame.
 *
 * `PageLayout` stays outermost and the provider sits inside it: the other way
 * round, the provider's Suspense fallback would replace the page header too,
 * and the whole page would blink on every server render.
 *
 * A `page.tsx` never sets `max-w-*`, `mx-auto` or page padding — it passes
 * `contentWidth` and lets the layout own all three.
 */
export default function Page() {
  return (
    <PageLayout
      eyebrow="Insight"
      title="Analytics"
      subtitle="Response times, category mix and district coverage, measured over the tables that already exist."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Analytics" }]}
      contentWidth="wide"
    >
      <ListStateProvider config={ANALYTICS_LIST} fallback={<AnalyticsViewSkeleton />}>
        <AnalyticsView />
      </ListStateProvider>
    </PageLayout>
  );
}
