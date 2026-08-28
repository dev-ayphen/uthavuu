import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import { ListPageSkeleton } from "@/features/moderation/table-skeleton";
import { USERS_LIST, UsersTable } from "@/features/users/users-table";

export const metadata = { title: "Users" };

/**
 * The citizen directory.
 *
 * `ListStateProvider` owns the `<Suspense>` boundary that `useSearchParams()`
 * requires — that is why the provider exists rather than a bare hook, and why
 * this page never declares one of its own.
 *
 * No `max-w-*`, no `mx-auto`, no padding: `PageLayout` owns the frame, this
 * page owns the content.
 */
export default function Page() {
  return (
    <PageLayout
      eyebrow="People"
      title="Users"
      subtitle="Everyone who has signed in on the mobile app, with what they've reported and who they've helped."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Users" }]}
      contentWidth="wide"
    >
      <ListStateProvider config={USERS_LIST} fallback={<ListPageSkeleton columns={7} filters={3} />}>
        <UsersTable />
      </ListStateProvider>
    </PageLayout>
  );
}
