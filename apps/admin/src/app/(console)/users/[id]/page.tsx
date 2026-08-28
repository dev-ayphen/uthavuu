import { PageLayout } from "@/components/layout";
import { UserDetail } from "@/features/users/user-detail";

export const metadata = { title: "Member" };

/**
 * One community member.
 *
 * A server component only so it can await `params` (a Promise in Next 16); the
 * record itself is fetched client-side by `UserDetail`, because the suspend /
 * reactivate actions need to invalidate and re-render without a full navigation.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PageLayout
      eyebrow="People"
      title="Member"
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Users", href: "/users" },
        { label: "Member" },
      ]}
      contentWidth="default"
    >
      <UserDetail userId={id} />
    </PageLayout>
  );
}
