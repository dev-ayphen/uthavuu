import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import {
  FLAGGED_COMMENTS_LIST,
  FlaggedCommentsTable,
} from "@/features/comments/flagged-comments-table";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";

export const metadata = { title: "Flagged Comments" };

/**
 * The comment-flag review queue.
 *
 * NOTE THE TITLE. `config/nav.ts` still labels this route "Flagged Reports",
 * which is what the scaffold assumed. The endpoint behind it is
 * `GET /admin/flagged-comments` and there is no report-flagging feature in the
 * API at all — `report_comment_flags` is the only flag table. The nav label is
 * outside this work's scope to change; it is flagged in the handover so it can
 * be corrected in the file that owns it.
 */
export default function Page() {
  return (
    <PageLayout
      eyebrow="Moderation"
      title="Flagged Comments"
      subtitle="Comments the community reported as abusive or wrong. Resolving a flag records what was decided, not just that someone looked."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Reports", href: "/reports" },
        { label: "Flagged" },
      ]}
      contentWidth="wide"
    >
      <ListStateProvider
        config={FLAGGED_COMMENTS_LIST}
        fallback={<ListPageSkeleton columns={8} filters={1} />}
      >
        <FlaggedCommentsTable />
      </ListStateProvider>
    </PageLayout>
  );
}
