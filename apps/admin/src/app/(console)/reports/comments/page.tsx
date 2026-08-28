import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { COMMENTS_LIST, CommentsTable } from "@/features/comments/comments-table";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

export const metadata = { title: "Comments" };

/**
 * Public Community Comments.
 *
 * The subtitle draws the line this page sits on: these are the comments anyone
 * reading a report can see. The private Mission Chat between a reporter and the
 * volunteers who accepted is a separate thing, has no admin endpoint, and is
 * not moderated from here.
 */
export default function Page() {
  return (
    <PageLayout
      eyebrow="Moderation"
      title="Comments"
      subtitle="The public conversation on help requests. Removed comments stay readable here so a decision can be reviewed."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Reports", href: "/reports" },
        { label: "Comments" },
      ]}
      contentWidth="wide"
    >
      <ListStateProvider config={COMMENTS_LIST} fallback={<ListPageSkeleton columns={6} filters={2} />}>
        <CommentsTable />
      </ListStateProvider>
    </PageLayout>
  );
}
