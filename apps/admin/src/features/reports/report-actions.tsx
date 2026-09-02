"use client";

import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, RotateCcw, Undo2, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { invalidateAll, runModerationAction } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import type { ReportStatus } from "./types";

const REPORT_KEYS = [["admin", "reports"]];

type Action = "close" | "reopen" | "hide" | "reinstate" | null;

/**
 * The narrowest report this component can act on.
 *
 * Deliberately NOT `AdminReportDetail`. The same four actions have to be
 * reachable from the moderation queue, where a row carries a fraction of the
 * detail projection — and the alternative, a second suspend/hide implementation
 * for the table, is how two surfaces end up disagreeing about which transitions
 * are legal. `AdminReportRow` and `AdminReportDetail` both satisfy this shape,
 * so the precondition table below is written once and obeyed everywhere.
 *
 * `storedStatusLabel` is optional because only the detail projection carries it
 * — see the reinstate dialog for how its absence is handled without inventing a
 * second key→label map the API would then be free to contradict.
 */
export type ModeratableReport = {
  id: string;
  title: string;
  /** DERIVED by the API. Never recomputed here — see ReportStatusBadge. */
  status: ReportStatus;
  storedStatus: string;
  /** The API's own label for the stored status. Absent on list rows. */
  storedStatusLabel?: string | null;
  counts: { activeVolunteers: number };
};

/**
 * Close, reopen, hide and reinstate.
 *
 * WHICH BUTTONS EXIST IS DERIVED FROM THE API'S OWN PRECONDITIONS
 * ───────────────────────────────────────────────────────────────────────────
 * `AdminReportModerationService` refuses each action under specific conditions,
 * and every one of those refusals is a round trip an operator spent a written
 * reason on. So the same conditions gate the buttons — not as security (the API
 * enforces that), but so the console never offers a door it knows is locked:
 *
 *   hidden report      → only Reinstate. Close and reopen both answer
 *                        REPORT_HIDDEN: "reinstate before changing status".
 *   stored 'closed'    → Reopen, not Close (REPORT_ALREADY_CLOSED).
 *   stored 'completed' → neither (REPORT_ALREADY_COMPLETED — the help arrived,
 *                        there is nothing to cancel).
 *   open or expired    → Close.
 *
 * Note it is `storedStatus` that decides, not the effective one: an EXPIRED
 * report is stored 'open', and closing it is both legal and useful — that is
 * how a moderator retires a request nobody answered.
 *
 * This is what makes the Actions column in the queue honest rather than
 * decorative: each row offers the transitions THAT row can actually make. A
 * fixed pair of buttons that the server rejects half the time trains operators
 * to expect failure and to stop reading the refusal.
 *
 * EVERY DIALOG QUOTES THE REPORT
 * ───────────────────────────────────────────────────────────────────────────
 * On the detail page "this report" is unambiguous. In a table of twenty-five
 * rows it is not, and the confirmation is the last point at which a
 * mis-clicked row can be caught — so the title is restated inside the dialog,
 * the same way `CommentActions` quotes the comment body it is about to remove.
 */
export function ReportActions({
  report,
  size = "sm",
  compact = false,
}: {
  report: ModeratableReport;
  size?: "sm" | "md";
  /** Short labels, for the Actions column where the row already gives context. */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action>(null);

  const hidden = report.status === "deleted";
  const canClose = !hidden && report.storedStatus === "open";
  const canReopen = !hidden && report.storedStatus === "closed";

  const run = (path: string, success: string) => (reason: string | undefined) =>
    runModerationAction({
      queryClient,
      path: `/admin/reports/${encodeURIComponent(report.id)}/${path}`,
      body: { reason },
      invalidate: REPORT_KEYS,
      success,
    }).then(() => undefined);

  const onStale = () => void invalidateAll(queryClient, REPORT_KEYS);

  const quote = <ReportQuote title={report.title} hidden={hidden} />;

  return (
    <>
      {canClose ? (
        <Button variant="secondary" size={size} onClick={() => setAction("close")}>
          <XCircle />
          {compact ? "Close" : "Close request"}
        </Button>
      ) : null}

      {canReopen ? (
        <Button variant="secondary" size={size} onClick={() => setAction("reopen")}>
          <RotateCcw />
          {compact ? "Reopen" : "Reopen request"}
        </Button>
      ) : null}

      {hidden ? (
        <Button variant="secondary" size={size} onClick={() => setAction("reinstate")}>
          <Undo2 />
          Reinstate
        </Button>
      ) : (
        <Button variant="danger" size={size} onClick={() => setAction("hide")}>
          <EyeOff />
          {compact ? "Hide" : "Hide from everyone"}
        </Button>
      )}

      <ConfirmActionDialog
        open={action === "close"}
        onOpenChange={(open) => setAction(open ? "close" : null)}
        title="Close this request?"
        description={
          report.counts.activeVolunteers > 0
            ? `It stops accepting volunteers, and the ${report.counts.activeVolunteers} ${
                report.counts.activeVolunteers === 1 ? "person" : "people"
              } currently on their way will be told it was cancelled.`
            : "It stops accepting volunteers and disappears from the citizen feed. It stays readable here."
        }
        confirmLabel="Close request"
        pendingLabel="Closing…"
        reason="required"
        reasonLabel="Why is this being closed?"
        reasonHint="Goes in the audit log. It is not sent to the reporter."
        onStale={onStale}
        onConfirm={run("close", "Request closed.")}
      >
        {quote}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={action === "reopen"}
        onOpenChange={(open) => setAction(open ? "reopen" : null)}
        title="Reopen this request?"
        description="It becomes findable again in the citizen feed and can accept volunteers, subject to its original expiry time."
        confirmLabel="Reopen request"
        pendingLabel="Reopening…"
        reason="required"
        reasonLabel="Why is this being reopened?"
        reasonHint="“Why did we put this back” is exactly what an appeal produces. Write the answer now."
        onStale={onStale}
        onConfirm={run("reopen", "Request reopened.")}
      >
        {quote}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={action === "hide"}
        onOpenChange={(open) => setAction(open ? "hide" : null)}
        title="Hide this report from everyone?"
        description="It disappears for the reporter and for every volunteer, with no notification to any of them. Moderators can still read it here, and it can be reinstated."
        confirmLabel="Hide report"
        pendingLabel="Hiding…"
        tone="danger"
        reason="required"
        reasonLabel="Why is this being hidden?"
        reasonHint="The title and description are snapshotted into the audit log — hiding is the action most likely to be appealed."
        onStale={onStale}
        onConfirm={run("hide", "Report hidden.")}
      >
        {quote}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={action === "reinstate"}
        onOpenChange={(open) => setAction(open ? "reinstate" : null)}
        title="Put this report back?"
        // The stored status is named only when the API supplied its label. The
        // list projection does not, and deriving one from `storedStatus` would
        // mean this console keeping a second key→label map for a lookup table
        // the API owns — wrong the first time a status is renamed, and wrong
        // silently. The shorter sentence is still true.
        description={
          report.storedStatusLabel
            ? `It returns to its previous status (${report.storedStatusLabel}) and becomes visible to the reporter again.`
            : "It returns to the status it had before it was hidden, and becomes visible to the reporter again."
        }
        confirmLabel="Reinstate report"
        pendingLabel="Reinstating…"
        reason="required"
        reasonLabel="Why is this being reinstated?"
        onStale={onStale}
        onConfirm={run("reinstate", "Report reinstated.")}
      >
        {quote}
      </ConfirmActionDialog>
    </>
  );
}

/** The request being acted on, so nobody moderates a row they mis-clicked. */
function ReportQuote({ title, hidden }: { title: string; hidden: boolean }) {
  return (
    <blockquote className="rounded-control border border-border bg-surface-inset px-3 py-2 text-xs text-fg">
      {hidden ? (
        <span className="mb-1 block text-[10px] font-bold text-danger-fg uppercase">
          Currently hidden
        </span>
      ) : null}
      {title}
    </blockquote>
  );
}
