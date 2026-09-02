import { PageLayout } from "@/components/layout";
import { AdminDetail } from "@/features/admin-accounts/admin-detail";
import { AdminsAccessDenied } from "@/features/admin-accounts/admins-access-denied";
import { getAdminAccountsAccess } from "@/features/admin-accounts/permission";

export const metadata = { title: "Admin Account" };

/**
 * One admin account.
 *
 * A server component only to await `params` (a Promise in Next 16) and resolve
 * the session; the record itself is fetched client-side by `AdminDetail`,
 * because edit / suspend / reactivate / revoke need to invalidate and re-render
 * without a full navigation. Same split as `users/[id]/page.tsx`.
 *
 * Gated on the same permission as the list. `GET /admin/admins/:id` needs
 * `platform:manage`, so an ops admin reaching this URL directly is shown why —
 * rather than a spinner that resolves into a 403 they have to decode.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { canManage, selfUserId }] = await Promise.all([
    params,
    getAdminAccountsAccess(),
  ]);

  return (
    <PageLayout
      eyebrow="Access"
      title="Admin account"
      breadcrumb={[
        { label: "Console", href: "/dashboard" },
        { label: "Admin", href: "/admins" },
        { label: "Account" },
      ]}
      contentWidth="default"
    >
      {canManage ? (
        <AdminDetail userId={id} canManage={canManage} selfUserId={selfUserId} />
      ) : (
        <AdminsAccessDenied />
      )}
    </PageLayout>
  );
}
