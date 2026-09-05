"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCcw, XCircle } from "lucide-react";
import { useState } from "react";

import { Badge, Button } from "@/components/ui";
import { invalidateAll, runModerationAction } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { PrivatePhoto, QuarantineNote } from "./private-photo";
import { automatedCheck, reasonLabel, reasonTone } from "./reason-copy";
import type { ReportPhotoRow } from "./types";

/**
 * Approve / Reject / Request a new photo.
 *
 * ==========================================================================
 * THE CONSOLE NEVER MOVES A REPORT. It asks the API to.
 * ==========================================================================
 * Each button POSTs to `/admin/report-photos/:id/{approve,reject,request-new}`.
 * The API re-checks the record's state, runs one transaction, writes the audit
 * row, creates the `report_photos` relationship (approval only) and transitions
 * the report. Then `runModerationAction` invalidates and the screen re-renders
 * from the refetched server answer.
 *
 * Nothing here is optimistic and nothing here patches the cache. An "Approved"
 * badge painted because a click returned 200 is a badge that can be wrong — and
 * on the one screen whose job is to be believed about whether a photograph is
 * public, a status that lies for 200ms is worse than one that waits. The same
 * reasoning is written out at length in `features/moderation/actions.ts`; this
 * feature does not get an exception to it.
 *
 * WHY BOTH REPORT KEYS ARE INVALIDATED
 * ───────────────────────────────────────────────────────────────────────────
 * One decision moves two things: the queue row AND the report's effective
 * status (`pending_review` -> `open`, or -> `rejected`). Refetching both is one
 * extra round trip and cannot drift; hand-patching would be a second copy of
 * the API's own transition rules, wrong the first time the backend adds a side
 * effect.
 *
 * WHY THE DIALOG SHOWS THE PHOTOGRAPH
 * ───────────────────────────────────────────────────────────────────────────
 * These buttons appear in a table, where the photo is a 64px thumbnail. A
 * decision to publish or refuse a citizen's emergency photograph must not be
 * made from a thumbnail, so the confirmation renders it at full size along with
 * the labels that actually fired. That is also why approving from the queue is
 * safe at all — the last chance to catch a mis-clicked row is this dialog, the
 * same way `ReportActions` quotes the report title it is about to hide.
 */

const PHOTO_KEYS = [
  // Prefix — covers the queue list AND ["admin","report-photos","summary"],
  // so the cards above the table and the sidebar badge move with the decision.
  ["admin", "report-photos"],
  // An approval publishes the report; a rejection ends it. Both change its
  // effective status, so the reports list and detail must refetch too.
  ["admin", "reports"],
];

/**
 * The narrowest photo this component can act on.
 *
 * Deliberately not `ReportPhotoDetail`: the same decisions have to be reachable
 * from the queue, where a row carries a fraction of the detail projection. One
 * shape both satisfy means one implementation, so the two surfaces can never
 * disagree about what a decision does.
 */
export type ReviewablePhoto = Pick<
  ReportPhotoRow,
  // `verificationStatus` is in here for one reason: it is the only field on a
  // queue ROW that says whether anything examined the photograph. Without it
  // the dialog would print the `verification-unavailable` code under
  // "Automated check flagged" — a finding about an image nothing looked at,
  // shown at the exact moment somebody is deciding whether to publish it.
  "id" | "reportTitle" | "reasons" | "decision" | "riskLevel" | "verificationStatus"
>;

type Decision = "approve" | "reject" | "request-new" | null;

export function PhotoReviewActions({
  photo,
  size = "sm",
  /**
   * The queue's Actions column has room for two buttons, not three. Approve and
   * Reject are what resolve a queue item; asking a citizen to retake a
   * photograph is the rarer third outcome and lives on the detail page, where
   * there is room to label it properly.
   */
  compact = false,
}: {
  photo: ReviewablePhoto;
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision>(null);

  const run = (path: string, success: string) => (reason: string | undefined) =>
    runModerationAction({
      queryClient,
      path: `/admin/report-photos/${encodeURIComponent(photo.id)}/${path}`,
      // `reason` is optional on approve and required on the other two; the
      // dialog has already enforced which, so the body is the same either way.
      body: reason ? { reason } : {},
      invalidate: PHOTO_KEYS,
      success,
    }).then(() => undefined);

  // A 409 PHOTO_ALREADY_REVIEWED means another moderator got there first. The
  // action did not happen, but the row on screen is out of date — and leaving
  // it wrong is how the same photo gets decided twice.
  const onStale = () => void invalidateAll(queryClient, PHOTO_KEYS);

  const evidence = <PhotoEvidence photo={photo} />;

  return (
    <>
      <Button variant="secondary" size={size} onClick={() => setDecision("approve")}>
        <CheckCircle2 />
        Approve
      </Button>

      <Button variant="danger" size={size} onClick={() => setDecision("reject")}>
        <XCircle />
        Reject
      </Button>

      {compact ? null : (
        <Button variant="secondary" size={size} onClick={() => setDecision("request-new")}>
          <RefreshCcw />
          Request new photo
        </Button>
      )}

      <ConfirmActionDialog
        open={decision === "approve"}
        onOpenChange={(open) => setDecision(open ? "approve" : null)}
        title="Approve this photo?"
        description="The API attaches it to the report and the report becomes public. Until you do, the report has no photo record at all."
        confirmLabel="Approve photo"
        pendingLabel="Approving…"
        // Optional, mirroring the endpoint. Approving is agreeing with the
        // photograph in front of you; demanding prose for it teaches people to
        // type "." to get past the field, which is worse than no note at all.
        reason="optional"
        reasonLabel="Note for the audit log"
        reasonHint="Worth writing when you are overruling the automated verdict."
        onStale={onStale}
        onConfirm={run("approve", "Photo approved. The report is now public.")}
      >
        {evidence}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={decision === "reject"}
        onOpenChange={(open) => setDecision(open ? "reject" : null)}
        title="Reject this photo?"
        description="The report never becomes public. It stays readable by its reporter and by this console."
        confirmLabel="Reject photo"
        pendingLabel="Rejecting…"
        tone="danger"
        reason="required"
        reasonLabel="Why is this being rejected?"
        reasonHint="Goes in the audit log. Rejection ends a request for help, so it is the decision most likely to be appealed."
        onStale={onStale}
        onConfirm={run("reject", "Photo rejected.")}
      >
        {evidence}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={decision === "request-new"}
        onOpenChange={(open) => setDecision(open ? "request-new" : null)}
        title="Ask for a different photo?"
        description="The report stays held. Say what is wrong with this photograph — somebody in an emergency is going to act on it."
        confirmLabel="Request new photo"
        pendingLabel="Sending…"
        reason="required"
        reasonLabel="What needs to be different?"
        reasonHint="Be specific and short. “Too dark to see the injury” is useful; “rejected” is not."
        onStale={onStale}
        onConfirm={run("request-new", "A new photo was requested.")}
      >
        {evidence}
      </ConfirmActionDialog>
    </>
  );
}

/**
 * What the decision is about: the photograph, the report it belongs to, and the
 * labels the backend says fired.
 *
 * The labels are rendered EXACTLY as `reasons` carries them. Nothing is added,
 * nothing is expanded into its taxonomy parents — see reason-copy.ts for why
 * that would undo the API's emergency carve-out on screen.
 */
function PhotoEvidence({ photo }: { photo: ReviewablePhoto }) {
  const check = automatedCheck(photo);

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-control border border-border">
        <PrivatePhoto photoId={photo.id} label="Held photo" />
      </div>

      <QuarantineNote />

      {photo.reportTitle ? (
        <blockquote className="rounded-control border border-border bg-surface-inset px-3 py-2 text-xs text-fg">
          {photo.reportTitle}
        </blockquote>
      ) : null}

      {check.ran ? (
        check.reasons.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="micro-label text-fg-muted">Automated check flagged</span>
            {check.reasons.map((reason) => (
              <Badge key={reason} tone={reasonTone(reason)}>
                {reasonLabel(reason)}
              </Badge>
            ))}
          </div>
        ) : null
      ) : (
        // Said out loud rather than left blank. A silent evidence block at a
        // confirmation dialog is read as "nothing was flagged", which here
        // would mean "nothing was looked at" — the opposite reassurance.
        <p className="text-[11px] text-fg-faint">
          Nothing examined this photograph — no moderation provider answered. There is no
          automated finding for or against it.
        </p>
      )}
    </div>
  );
}
