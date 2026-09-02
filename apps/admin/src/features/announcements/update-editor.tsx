"use client";

import { useRouter } from "next/navigation";

import { DateCell, DetailField, DetailFields, MutedCell, PersonCell } from "@/components/data";
import { Skeleton } from "@/components/ui";
import { TIMEZONE_LABEL } from "./dates";
import { DetailFallback, useDetailQuery } from "@/features/moderation/detail-query";
import { PublishWindow } from "./publish-window";
import { ANNOUNCEMENTS_INDEX } from "./routes";
import { TamilCoverageBadge, tamilCoverage } from "./tamil-coverage";
import { UPDATE_NOT_FOUND_CODES } from "./update-errors";
import type { AdminUpdate } from "./types";
import { UpdateActions } from "./update-actions";
import { UpdateForm } from "./update-form";
import { UpdateStatusBadge } from "./update-status-badge";

/**
 * One announcement, editable.
 *
 * Fetched client-side rather than in the server page so that publish / archive /
 * delete can invalidate and re-render in place — the same split
 * `reports/[id]/page.tsx` makes with `ReportDetail`.
 *
 * BRANCH ORDER IS THE HOOK'S, NOT THIS COMPONENT'S. `useDetailQuery` resolves
 * loading -> failure -> not-found -> ready into a single `view.kind`, so a
 * failed request cannot render "this update doesn't exist" — a very different
 * thing to tell an operator than "the API is down".
 *
 * THE FORM IS KEYED ON THE RECORD ID. React Query hands back a new object on
 * every background refetch; without the key, `UpdateForm` would keep the first
 * record's `defaultValues` forever after an id change, and WITH a naive effect
 * it would clobber what the operator is typing. Remounting is the honest way to
 * change which record is being edited.
 */
export function UpdateEditor({ updateId }: { updateId: string }) {
  const router = useRouter();

  const { view } = useDetailQuery<AdminUpdate>({
    key: ["admin", "community-updates", "detail", updateId],
    path: `/admin/community-updates/${encodeURIComponent(updateId)}`,
    // `UPDATE_NOT_FOUND`, transcribed from the service's own NotFoundException.
    // It matters that this is the real code and not a guess: a 404 carrying no
    // recognised code falls through to `classifyListFailure`, which renders
    // "that list doesn't exist yet" — the right answer for an unbuilt endpoint,
    // and quite the wrong one for an update somebody just deleted.
    notFoundCodes: UPDATE_NOT_FOUND_CODES,
  });

  if (view.kind === "loading") return <EditorSkeleton />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="That announcement no longer exists"
        notFoundDescription="It may have been deleted while this page was open."
        backHref={ANNOUNCEMENTS_INDEX}
        backLabel="Back to announcements"
      />
    );
  }

  const record = view.record;

  return (
    <div className="space-y-5">
      <DetailFields columns={3}>
        <DetailField label="Status">
          <UpdateStatusBadge status={record.status} />
        </DetailField>
        <DetailField label="Tamil">
          <TamilCoverageBadge coverage={tamilCoverage(record)} />
        </DetailField>
        <DetailField label="Author">
          {record.authorDeleted ? (
            <PersonCell person={{ name: record.author?.name ?? null, deleted: true }} />
          ) : record.author ? (
            <PersonCell person={{ id: record.author.id, name: record.author.name }} />
          ) : (
            <MutedCell value="No author recorded" />
          )}
        </DetailField>
        <DetailField label={`Publish window (${TIMEZONE_LABEL})`} span={2}>
          <PublishWindow publishAt={record.publishAt} expiresAt={record.expiresAt} />
        </DetailField>
        <DetailField label="Last edited">
          <DateCell value={record.updatedAt} withTime relative />
        </DetailField>
      </DetailFields>

      <UpdateForm
        key={record.id}
        record={record}
        secondaryActions={
          <UpdateActions
            update={record}
            // Nothing to return to once the record is gone. `replace`, so the
            // back button does not land on a detail page for a deleted update.
            onDeleted={() => router.replace(ANNOUNCEMENTS_INDEX)}
          />
        }
      />
    </div>
  );
}

/** Mirrors the loaded shape — meta strip, two editor cards, schedule, action bar. */
function EditorSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-3 w-16" />
            <Skeleton className="mt-2 h-11 w-full" />
            <Skeleton className="mt-4 h-3 w-16" />
            <Skeleton className="mt-2 h-48 w-full" />
          </div>
        ))}
      </div>

      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border py-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
    </div>
  );
}
