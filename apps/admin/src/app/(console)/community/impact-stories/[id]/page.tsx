import { PageLayout } from "@/components/layout";
import { StoryDetail } from "@/features/impact-stories/story-detail";

export const metadata = { title: "Impact Story" };

/**
 * One impact story.
 *
 * A server component only to await `params`; the record is fetched client-side
 * by `StoryDetail`, which is where the loading / failure / not-found branches
 * live. There is nothing to mutate here — the section is read-only (open
 * question 12) — so the client fetch buys the branch discipline, not
 * invalidation.
 *
 * The `[id]` is the `mission_completions` id, not the report id: the story IS
 * the completion, and one report has at most one.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PageLayout
      eyebrow="Community"
      title="Impact Story"
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Community" },
        { label: "Impact Stories", href: "/community/impact-stories" },
        { label: "Story" },
      ]}
      contentWidth="default"
    >
      <StoryDetail storyId={id} />
    </PageLayout>
  );
}
