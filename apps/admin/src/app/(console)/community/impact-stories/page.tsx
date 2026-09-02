import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { IMPACT_STORIES_LIST } from "@/features/impact-stories/use-impact-stories";
import { StoriesTable, StoriesTableSkeleton } from "@/features/impact-stories/stories-table";

export const metadata = { title: "Impact Stories" };

/**
 * The public record of help that actually landed.
 *
 * The subtitle says "read-only" out loud on purpose. The sidebar carries an
 * `impactStoriesPending` badge, which implies a review queue — there isn't one:
 * a completion is inserted already `verified` in the same statement that creates
 * it, and whether Impact Stories should have an approval workflow is open
 * question 12, undecided. Rather than ship an Approve button that would answer a
 * product question by accident, the page states what it is: a record, not a
 * queue. Removing a story is the *report's* moderation action, on /reports/[id].
 */
export default function Page() {
  return (
    <PageLayout
      eyebrow="Community"
      title="Impact Stories"
      subtitle="Completed missions, newest first — the before and after, who helped, and how long it took. Read-only: this is the record, not a review queue."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Community" },
        { label: "Impact Stories" },
      ]}
      contentWidth="wide"
    >
      <ListStateProvider config={IMPACT_STORIES_LIST} fallback={<StoriesTableSkeleton />}>
        <StoriesTable />
      </ListStateProvider>
    </PageLayout>
  );
}
