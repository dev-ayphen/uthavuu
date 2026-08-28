"use client";

import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, RotateCcw, Undo2, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { invalidateAll, runModerationAction } from "@/features/moderation/actions";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import type { AdminReportDetail } from "./types";

const REPORT_KEYS = [["admin", "reports"]];

type Action = "close" | "reopen" | "hide" | "reinstate" | null;

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
 */
export function ReportActions({ report }: { report: AdminReportDetail }) {
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

  return (
    <>
      {canClose ? (
        <Button variant="secondary" size="sm" onClick={() => setAction("close")}>
          <XCircle />
          Close request
        </Button>
      ) : null}

      {canReopen ? (
        <Button variant="secondary" size="sm" onClick={() => setAction("reopen")}>
          <RotateCcw />
          Reopen request
        </Button>
      ) : null}

      {hidden ? (
        <Button variant="secondary" size="sm" onClick={() => setAction("reinstate")}>
          <Undo2 />
          Reinstate
        </Button>
      ) : (
        <Button variant="danger" size="sm" onClick={() => setAction("hide")}>
          <EyeOff />
          Hide from everyone
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
      />

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
      />

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
      />

      <ConfirmActionDialog
        open={action === "reinstate"}
        onOpenChange={(open) => setAction(open ? "reinstate" : null)}
        title="Put this report back?"
        description={`It returns to its previous status (${report.storedStatusLabel}) and becomes visible to the reporter again.`}
        confirmLabel="Reinstate report"
        pendingLabel="Reinstating…"
        reason="required"
        reasonLabel="Why is this being reinstated?"
        onStale={onStale}
        onConfirm={run("reinstate", "Report reinstated.")}
      />
    </>
  );
}
