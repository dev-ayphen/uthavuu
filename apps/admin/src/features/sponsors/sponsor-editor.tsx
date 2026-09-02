"use client";

import { useRouter } from "next/navigation";

import { DateCell, DetailField, DetailFields } from "@/components/data";
import { Skeleton } from "@/components/ui";
import { DetailFallback, useDetailQuery } from "@/features/moderation/detail-query";

import { CampaignWindow } from "./campaign-window";
import { CreativeLink, CreativeTypeBadge } from "./creative";
import { TIMEZONE_LABEL } from "./dates";
import { PlacementList } from "./placement-list";
import { SPONSORS_INDEX } from "./routes";
import { SponsorActions } from "./sponsor-actions";
import { SPONSOR_NOT_FOUND_CODES } from "./sponsor-errors";
import { SponsorForm } from "./sponsor-form";
import { SponsorStatusBadge } from "./sponsor-status-badge";
import type { AdminSponsor } from "./types";

/**
 * One sponsor, editable.
 *
 * Fetched client-side rather than in the server page so that pause / activate /
 * delete can invalidate and re-render in place — the same split
 * `reports/[id]/page.tsx` makes with `ReportDetail`.
 *
 * BRANCH ORDER IS THE HOOK'S, NOT THIS COMPONENT'S. `useDetailQuery` resolves
 * loading -> failure -> not-found -> ready into a single `view.kind`, so a
 * failed request cannot render "this sponsor doesn't exist" — a very different
 * thing to tell an operator than "the API is down". While `/admin/sponsors` is
 * still unbuilt, every load lands in the `failure` branch with the API's own
 * 404, which `classifyListFailure` renders as "that list doesn't exist yet".
 * Nothing here invents a record to fill the gap.
 *
 * THE FORM IS KEYED ON THE RECORD ID. React Query hands back a new object on
 * every background refetch; without the key, `SponsorForm` would keep the first
 * record's `defaultValues` forever after an id change, and WITH a naive effect
 * it would clobber what the operator is typing. Remounting is the honest way to
 * change which record is being edited.
 */
export function SponsorEditor({ sponsorId }: { sponsorId: string }) {
  const router = useRouter();

  const { view } = useDetailQuery<AdminSponsor>({
    key: ["admin", "sponsors", "detail", sponsorId],
    path: `/admin/sponsors/${encodeURIComponent(sponsorId)}`,
    // Predicted rather than transcribed — the service has not landed. See the
    // header of ./sponsor-errors.ts for why that is safe here: an unrecognised
    // 404 simply falls through to "that list doesn't exist yet" instead of
    // "that sponsor was deleted", which is the right answer for an unbuilt
    // endpoint and the wrong one only once the endpoint exists.
    notFoundCodes: SPONSOR_NOT_FOUND_CODES,
  });

  if (view.kind === "loading") return <EditorSkeleton />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="That sponsor no longer exists"
        notFoundDescription="It may have been deleted while this page was open."
        backHref={SPONSORS_INDEX}
        backLabel="Back to sponsors"
      />
    );
  }

  const record = view.record;

  return (
    <div className="space-y-5">
      <DetailFields columns={3}>
        <DetailField label="Status">
          <SponsorStatusBadge status={record.status} />
        </DetailField>
        <DetailField label="Creative">
          <span className="flex flex-wrap items-center gap-2">
            <CreativeTypeBadge type={record.creativeType} />
            <CreativeLink sponsor={record} className="text-xs" />
          </span>
        </DetailField>
        <DetailField label="Last edited">
          <DateCell value={record.updatedAt} withTime relative />
        </DetailField>
        <DetailField label="Placements" span={2}>
          <PlacementList placements={record.placements} />
        </DetailField>
        <DetailField label={`Campaign window (${TIMEZONE_LABEL})`}>
          <CampaignWindow startDate={record.startDate} endDate={record.endDate} />
        </DetailField>
      </DetailFields>

      {/* WHY THERE IS NO PERFORMANCE PANEL, SAID OUT LOUD.
          The prototype had one (§3.6, a per-sponsor analytics modal), and an
          operator who used it will look for it here. §4.1 records why it was
          fiction: mobile reports no impressions, so its 12,840 / 342 could only
          ever be the seeded mock values. The backend schema reaches the same
          conclusion independently — "a counter column could only ever display a
          number nothing in this system can produce... it looks like evidence".
          Naming the absence is the honest move: silence would read as a
          half-built page, and a zero would read as a measurement. */}
      <p className="rounded-card border border-dashed border-border bg-surface-2 px-3.5 py-3 text-xs text-fg-subtle">
        <span className="font-semibold text-fg-muted">
          Delivery and revenue are not tracked.
        </span>{" "}
        The mobile app doesn&rsquo;t report impressions or clicks, so this console shows no view,
        click or click-through figure — and sponsorship is a business agreement rather than
        something derived from counts, so no revenue is shown either. Anything here would be a
        number nothing in the product can produce.
      </p>

      <SponsorForm
        key={record.id}
        record={record}
        secondaryActions={
          <SponsorActions
            sponsor={record}
            // Nothing to return to once the record is gone. `replace`, so the
            // back button does not land on a detail page for a deleted sponsor.
            onDeleted={() => router.replace(SPONSORS_INDEX)}
          />
        }
      />
    </div>
  );
}

/** Mirrors the loaded shape — meta strip, note, two editor columns, schedule, action bar. */
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

      <Skeleton className="h-12 w-full rounded-card" />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-4 shadow-card">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="mt-4 h-3 w-16" />
              <Skeleton className="mt-2 h-11 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-5">
          <div className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-4 h-11 w-full" />
          </div>
          <div className="rounded-card border border-border bg-surface p-4 shadow-card">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <Skeleton className="h-4 w-24" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
