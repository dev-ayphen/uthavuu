import { ListStateProvider } from "@/components/data";
import { PageLayout } from "@/components/layout";
import {
  AdminsAccessDenied,
  ChangeMyPasswordButton,
} from "@/features/admin-accounts/admins-access-denied";
import { AdminsTable, AdminsTableSkeleton } from "@/features/admin-accounts/admins-table";
import { getAdminAccountsAccess } from "@/features/admin-accounts/permission";
import { ADMINS_LIST } from "@/features/admin-accounts/use-admin-accounts";

export const metadata = { title: "Admin Accounts" };

/**
 * Who can sign in to this console, and what each of them can do.
 *
 * A SERVER COMPONENT ONLY FOR THE SESSION
 * ───────────────────────────────────────────────────────────────────────────
 * This page used to fetch the list here too, with `serverApiFetch`. It cannot
 * any more, and the reason is the point of this whole section: suspending,
 * revoking or editing an admin has to invalidate and re-render the table in
 * place. A server fetch would need a full navigation to reflect what the
 * operator just did, which on a destructive action means a moment where the
 * screen still shows the state they just removed.
 *
 * So the rows are fetched client-side by `AdminsTable`, and this component
 * resolves exactly two things the client cannot: whether this operator holds
 * `platform:manage`, and who they are. Both come from `GET /admin/me` via the
 * console's one session mechanism — never from a URL, which is the fail-open
 * pattern CLAUDE.md names as the thing not to build.
 *
 * `GET /admin/admins` requires `platform:manage`, which only super_admin holds.
 * An ops admin therefore gets a 403 — an expected, correct outcome, not a
 * failure — so it is rendered as an explanation rather than an error state.
 * That explanation still offers them the one thing they CAN do here: change
 * their own password, which needs no permission at all.
 */
export default async function Page() {
  const { canManage, selfUserId } = await getAdminAccountsAccess();

  return (
    <PageLayout
      eyebrow="Access"
      title="Admin Accounts"
      subtitle="Who can sign in to this console, what each of them can do, and how to take it away."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Admin" }]}
      contentWidth="wide"
      // Available whatever the role: changing your own password is scoped by
      // the endpoint's path, not by a permission.
      actions={<ChangeMyPasswordButton />}
    >
      {canManage ? (
        <ListStateProvider config={ADMINS_LIST} fallback={<AdminsTableSkeleton />}>
          <AdminsTable canManage={canManage} selfUserId={selfUserId} />
        </ListStateProvider>
      ) : (
        <AdminsAccessDenied />
      )}
    </PageLayout>
  );
}
