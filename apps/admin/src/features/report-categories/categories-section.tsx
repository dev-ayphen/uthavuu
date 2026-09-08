"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { ListStateProvider } from "@/components/data";
import { SectionHeading } from "@/components/layout";
import { Button } from "@/components/ui";
import { invalidateAll } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { REPORT_CATEGORY_KEYS, runCategoryAction } from "./api";
import { CategoriesTable, CategoriesTableSkeleton } from "./categories-table";
import { CategoryFormDialog } from "./category-form-dialog";
import { isCategoryStaleConflict } from "./category-errors";
import { CATEGORIES_LIST } from "./use-report-categories";
import type { DeleteReportCategoryResponse, ReportCategoryRow } from "./types";

/**
 * Platform -> Categories: the heading, the create button, the table, and the two
 * dialogs the rows open.
 *
 * WHY A CLIENT COMPONENT WRAPS THE WHOLE SECTION. `page.tsx` is a server
 * component — it has to be, because it resolves the permission — but "New
 * category" opens a dialog, and the dialog's target has to be shared with the
 * table's row actions. One piece of client state (`dialog` below) owns all
 * three, so the button and the rows cannot disagree about what is open. The page
 * keeps its layout contract: it sets no width, no margin and no padding, and the
 * frame still comes from `platform/layout.tsx`.
 *
 * WHY THE FORM DIALOG IS CONDITIONALLY MOUNTED AND THE CONFIRM DIALOG IS NOT.
 * This is the console's existing split (see `admin-accounts/admin-actions.tsx`).
 * `CategoryFormDialog` is mounted only while it is open, which guarantees its
 * `record` prop is settled at construction — that is what lets it compute
 * `defaultValues` with `useMemo` instead of resetting from an effect, so a
 * background refetch can never wipe a half-typed label. `ConfirmActionDialog`
 * owns its own pending and failure state and is driven by `open`, as everywhere
 * else in this console.
 */
type Dialog =
  | { kind: "form"; record: ReportCategoryRow | null }
  | { kind: "delete"; record: ReportCategoryRow };

export function CategoriesSection() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Stable identities so `buildColumns` is not rebuilt on every render — the
  // table memoises its columns on exactly these two.
  const openEdit = useCallback(
    (record: ReportCategoryRow) => setDialog({ kind: "form", record }),
    [],
  );
  const openDelete = useCallback(
    (record: ReportCategoryRow) => setDialog({ kind: "delete", record }),
    [],
  );

  const deleting = dialog?.kind === "delete" ? dialog.record : null;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Categories"
        description="What a citizen can ask for help with, and how long each kind of request stays live."
        actions={
          <Button size="sm" onClick={() => setDialog({ kind: "form", record: null })}>
            <Plus />
            New category
          </Button>
        }
      />

      <ListStateProvider config={CATEGORIES_LIST} fallback={<CategoriesTableSkeleton />}>
        <CategoriesTable onEdit={openEdit} onDelete={openDelete} />
      </ListStateProvider>

      {dialog?.kind === "form" ? (
        <CategoryFormDialog
          open
          onOpenChange={(open) => setDialog(open ? dialog : null)}
          record={dialog.record}
        />
      ) : null}

      <ConfirmActionDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
        title={deleting ? `Delete ${deleting.label}?` : "Delete category?"}
        description={
          <>
            This removes the category from the mobile app immediately — citizens will no longer see
            it in the picker. It cannot be undone from this console.
            <br />
            <br />
            The API refuses the delete if any report has ever used this category, or if it is the
            last one citizens can post under. To retire a category that has history, edit it and
            untick &ldquo;Citizens can post to it&rdquo; instead — existing reports keep working.
          </>
        }
        confirmLabel="Delete category"
        pendingLabel="Deleting…"
        tone="danger"
        // The endpoint declares no `@Body()` on DELETE, so there is nowhere for a
        // reason to go. Asking for one and discarding it would be theatre.
        reason="none"
        onConfirm={() => {
          if (!deleting) return Promise.resolve();

          return runCategoryAction<DeleteReportCategoryResponse>({
            queryClient,
            path: `/admin/report-categories/${encodeURIComponent(deleting.id)}`,
            method: "DELETE",
            success: `${deleting.label} deleted.`,
          })
            .then(() => undefined)
            .catch((error: unknown) => {
              // `ConfirmActionDialog` decides staleness with the MODERATION
              // catalogue, which has never heard of `CATEGORY_NOT_FOUND` — so
              // its own `onStale` cannot fire for this section's codes. Rethrown
              // after refetching so the dialog still shows the API's message;
              // announcements solves the same mismatch the same way.
              if (isCategoryStaleConflict(error)) {
                void invalidateAll(queryClient, REPORT_CATEGORY_KEYS);
              }
              throw error;
            });
        }}
      />
    </div>
  );
}
