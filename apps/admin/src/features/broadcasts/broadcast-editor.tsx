"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";

import {
  DateCell,
  DetailField,
  DetailFields,
  MutedCell,
  PersonCell,
  formatDate,
} from "@/components/data";
import { Card, CardBody, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import { TIMEZONE_LABEL } from "@/features/announcements/dates";
import { TamilCoverageBadge, tamilCoverage } from "@/features/announcements/tamil-coverage";
import { DetailFallback, useDetailQuery } from "@/features/moderation/detail-query";
import { AudienceSummary } from "./audience-summary";
import { BroadcastActions } from "./broadcast-actions";
import { BroadcastForm } from "./broadcast-form";
import { BroadcastStatusBadge } from "./broadcast-status-badge";
import { BROADCAST_NOT_FOUND_CODES } from "./broadcast-errors";
import { DeliveryPanel } from "./delivery-figures";
import { BROADCASTS_INDEX } from "./routes";
import { broadcastPath } from "./api";
import { hasBroadcastFannedOut, isBroadcastEditable, type AdminBroadcast } from "./types";

/**
 * One broadcast.
 *
 * Fetched client-side rather than in the server page so that send / cancel /
 * delete can invalidate and re-render in place — the same split
 * `reports/[id]/page.tsx` and `UpdateEditor` make.
 *
 * BRANCH ORDER IS THE HOOK'S, NOT THIS COMPONENT'S. `useDetailQuery` resolves
 * loading -> failure -> not-found -> ready into a single `view.kind`, so a
 * failed request cannot render "this broadcast doesn't exist" — a very
 * different thing to tell an operator than "the API is down".
 *
 * THE FORM IS KEYED ON THE RECORD ID. React Query hands back a new object on
 * every background refetch; without the key, `BroadcastForm` would keep the
 * first record's `defaultValues` forever after an id change, and with a naive
 * effect it would clobber what the operator is typing.
 *
 * A TERMINAL BROADCAST GETS NO FORM AT ALL. `PATCH` is refused on `sending`,
 * `sent` and `cancelled` (`BROADCAST_IMMUTABLE` / `BROADCAST_ALREADY_SENT`),
 * so rendering an editable form there would hand an operator controls whose
 * only possible outcome is a 409 — and, worse, would imply that the copy on
 * fifty thousand phones is still something this console can change. The
 * read-only view below says what it says instead.
 */
export function BroadcastEditor({ broadcastId }: { broadcastId: string }) {
  const router = useRouter();

  const { view } = useDetailQuery<AdminBroadcast>({
    key: ["admin", "broadcasts", "detail", broadcastId],
    path: broadcastPath(broadcastId),
    // `BROADCAST_NOT_FOUND`, transcribed from the service's own
    // NotFoundException. It matters that this is the real code and not a guess:
    // a 404 carrying no recognised code falls through to `classifyListFailure`,
    // which renders "that list doesn't exist yet" — the right answer for an
    // unbuilt endpoint, and quite the wrong one for a draft somebody deleted.
    notFoundCodes: BROADCAST_NOT_FOUND_CODES,
  });

  if (view.kind === "loading") return <EditorSkeleton />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="That broadcast no longer exists"
        notFoundDescription="It may have been deleted while this page was open. Only drafts can be deleted, so nothing was ever sent from it."
        backHref={BROADCASTS_INDEX}
        backLabel="Back to broadcasts"
      />
    );
  }

  const record = view.record;
  const editable = isBroadcastEditable(record);

  return (
    <div className="space-y-5">
      <DetailFields columns={3}>
        <DetailField label="Status">
          <BroadcastStatusBadge status={record.status} />
        </DetailField>
        <DetailField label="Audience">
          <AudienceSummary record={record} />
        </DetailField>
        <DetailField label="Tamil">
          <TamilCoverageBadge coverage={tamilCoverage(record)} />
        </DetailField>
        <DetailField label={`Timing (${TIMEZONE_LABEL})`}>
          <Timing record={record} />
        </DetailField>
        <DetailField label="Written by">
          {/* `createdByDeleted` is the API's report that ON DELETE SET NULL
              fired: the staff account is gone, the record of what was broadcast
              is not. Naming that is both honest and the answer to "why can't I
              open this profile?". */}
          {record.createdByDeleted ? (
            <PersonCell person={{ name: record.createdBy?.name ?? null, deleted: true }} />
          ) : record.createdBy ? (
            <PersonCell person={{ id: record.createdBy.id, name: record.createdBy.name }} />
          ) : (
            <MutedCell value="No sender recorded" />
          )}
        </DetailField>
        <DetailField label="Last edited">
          <DateCell value={record.updatedAt} withTime relative />
        </DetailField>
      </DetailFields>

      {/* Only once there is something to count. Before a send both figures are
          null, and an empty "Delivery" card would imply a measurement failed
          rather than that nothing has happened yet. */}
      {hasBroadcastFannedOut(record) ? (
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
            <span className="micro-label text-fg-faint">Two measurements, not a ratio</span>
          </CardHeader>
          <CardBody>
            {record.status.key === "sending" ? <StuckSendNotice /> : null}
            <DeliveryPanel record={record} />
          </CardBody>
        </Card>
      ) : null}

      {editable ? (
        <BroadcastForm
          key={record.id}
          record={record}
          secondaryActions={
            <BroadcastActions
              record={record}
              // Nothing to return to once the draft is gone. `replace`, so the
              // back button does not land on a detail page for a deleted row.
              onDeleted={() => router.replace(BROADCASTS_INDEX)}
            />
          }
        />
      ) : (
        <ReadOnlyCopy record={record} />
      )}
    </div>
  );
}

/** Which date this row actually has, named rather than implied. */
function Timing({ record }: { record: AdminBroadcast }) {
  const sent = formatDate(record.sentAt, true);
  const planned = formatDate(record.scheduledAt, true);

  return (
    <span className="block">
      {sent ? (
        <span className="tabular block whitespace-nowrap text-fg-subtle">Sent {sent}</span>
      ) : null}
      {planned ? (
        <span className="tabular block whitespace-nowrap text-fg-subtle">
          {record.status.key === "cancelled" ? "Was planned for" : "Planned for"} {planned}
        </span>
      ) : null}
      {!sent && !planned ? (
        <span className="tabular block whitespace-nowrap text-fg-subtle">
          Written {formatDate(record.createdAt, true)}
        </span>
      ) : null}
      {/* The caveat belongs wherever a planned time is shown, because the plain
          reading of "Planned for 6pm" is that something happens at 6pm. */}
      {planned && !sent && record.status.key === "scheduled" ? (
        <span className="block text-[11px] text-warning-fg">Does not send itself</span>
      ) : null}
    </span>
  );
}

/**
 * `sending` is not a progress bar.
 *
 * The service leaves a broadcast here when a fan-out dies partway, deliberately
 * — reverting to `draft` would invite a second send that double-notifies
 * everyone already reached. The console cannot tell "in flight right now" from
 * "died two hours ago", and pretending otherwise in either direction would be
 * worse than saying so.
 */
function StuckSendNotice() {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-control border border-warning-soft-border bg-warning-soft px-3 py-2 text-xs text-warning-fg">
      <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        A fan-out claimed this broadcast and has not reported finishing. If it is not still
        running, it stopped partway — the counts below cover only what completed, and the people
        it did reach already have it. There is no safe retry from this console: sending again
        would notify them a second time. Escalate to an engineer.
      </span>
    </p>
  );
}

/**
 * The copy of a broadcast that can no longer be changed.
 *
 * Rendered as text rather than as disabled inputs. A greyed-out form says "you
 * may not edit this right now"; this is "this is a record of something that
 * happened", which is a different sentence and the true one.
 */
function ReadOnlyCopy({ record }: { record: AdminBroadcast }) {
  const sent = record.status.key === "sent" || record.status.key === "sending";

  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-card border border-border bg-surface-2 px-3.5 py-3 text-sm text-fg-subtle">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-faint" />
        <span>
          {sent ? (
            <>
              This broadcast has gone out and is no longer editable. The copy below is on
              people&apos;s phones and in alert lists this console does not own — changing it here
              would rewrite a history its readers can still see. Write a new broadcast to correct
              it.
            </>
          ) : (
            <>
              This broadcast was cancelled before it was sent. Cancelling is terminal, so the copy
              below is kept as a record of what was planned. Write a new broadcast if the plan
              comes back.
            </>
          )}
        </span>
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>English</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm font-bold text-fg">{record.titleEn}</p>
            <p className="text-sm whitespace-pre-wrap text-fg-subtle">{record.bodyEn}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span lang="ta">தமிழ்</span>
              <span className="text-fg-faint">/ Tamil</span>
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {record.titleTa ? (
              <p lang="ta" className="text-sm font-bold text-fg">
                {record.titleTa}
              </p>
            ) : (
              <p className="text-xs text-fg-faint">
                No Tamil title — Tamil readers saw the English headline.
              </p>
            )}
            {record.bodyTa ? (
              <p lang="ta" className="text-sm whitespace-pre-wrap text-fg-subtle">
                {record.bodyTa}
              </p>
            ) : (
              <p className="text-xs text-fg-faint">
                No Tamil body — Tamil readers saw the English text.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** Mirrors the loaded shape — meta strip, two copy cards, the action bar. */
function EditorSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
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
            <Skeleton className="mt-2 h-44 w-full" />
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
