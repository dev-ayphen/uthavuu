import { ListStateProvider } from "@/components/data";
import { CATEGORIES_LIST } from "@/features/report-categories/use-report-categories";
import {
  CategoriesTable,
  CategoriesTableSkeleton,
} from "@/features/report-categories/categories-table";

export const metadata = { title: "Categories" };

/** Frame comes from `platform/layout.tsx` (SubMenuPageLayout, Mode B scroll). */
export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-fg">Categories</h2>
        <p className="mt-0.5 text-fg-subtle">
          What a citizen can ask for help with, and how long each kind of request stays live.
        </p>
      </div>

      <ListStateProvider config={CATEGORIES_LIST} fallback={<CategoriesTableSkeleton />}>
        <CategoriesTable />
      </ListStateProvider>
    </div>
  );
}
