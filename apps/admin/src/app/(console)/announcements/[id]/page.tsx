import { AccessDeniedState } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";
import { PageLayout } from "@/components/layout";
import { canManageAnnouncements } from "@/features/announcements/permission";
import { UpdateEditor } from "@/features/announcements/update-editor";

export const metadata = { title: "Announcement" };

/**
 * One announcement, editable.
 *
 * A server component only to await `params` and resolve the permission; the
 * record itself is fetched client-side by `UpdateEditor` so publish / archive /
 * delete can invalidate and re-render in place. Same split as
 * `reports/[id]/page.tsx`.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, canManage] = await Promise.all([params, canManageAnnouncements()]);

  return (
    <PageLayout
      eyebrow="Publishing"
      title="Announcement"
      subtitle="Edit the text, adjust the window, or publish it. Blank Tamil fields fall back to the English."
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Announcements", href: "/announcements" },
        { label: "Announcement" },
      ]}
      contentWidth="wide"
    >
      {canManage ? <UpdateEditor updateId={id} /> : <AccessDeniedState {...ACCESS_DENIED.announcements} />}
    </PageLayout>
  );
}
