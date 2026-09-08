import { AccessDeniedState } from "@/components/ui";
import { CategoriesSection } from "@/features/report-categories/categories-section";
import { canManageReportCategories } from "@/features/report-categories/permission";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";

export const metadata = { title: "Categories" };

/**
 * Frame comes from `platform/layout.tsx` (SubMenuPageLayout, Mode B scroll) —
 * this page sets no width, no margin and no padding of its own.
 *
 * A server component only to resolve the permission; everything below is client
 * side, because the create/edit/delete dialogs are.
 *
 * GATED WHOLE, EVEN THOUGH READING IS NOW WIDER. `GET /admin/report-categories`
 * was relaxed to `reports:manage` so the Reports page's Category filter works
 * for ops admins (see `AdminCategoriesController`) — but every WRITE still needs
 * `platform:manage`, and this screen is a management screen. Showing an ops
 * admin a table whose every control the API would refuse reads as a broken
 * console rather than as a boundary working correctly, so they get the refusal
 * with a reason instead. `config/nav.ts` gates the nav entry on the same
 * permission, which keeps the two consistent.
 */
export default async function Page() {
  const canManage = await canManageReportCategories();

  if (!canManage) {
    return <AccessDeniedState {...ACCESS_DENIED.categories} />;
  }

  return <CategoriesSection />;
}
