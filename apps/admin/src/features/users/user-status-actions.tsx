"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, Eye, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Alert, Button } from "@/components/ui";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { invalidateAll, runModerationAction } from "@/features/moderation/actions";
import type { AdminUserDetail } from "./types";

const USER_KEYS = [["admin", "users"]];

/**
 * Suspend and reactivate.
 *
 * WHAT SUSPENSION ACTUALLY DOES, SPELLED OUT IN THE DIALOG
 * ───────────────────────────────────────────────────────────────────────────
 * It blocks sign-in. It does NOT take anything down: the person's reports stay
 * listed, their comments stay readable, their impact stories stay published.
 * An admin who assumes otherwise suspends an account expecting the abusive
 * comment to disappear, sees it still sitting there, and suspends again — or
 * worse, tells a complainant it has been handled. So the consequence is written
 * into the confirmation, not left to be inferred from the button's name, and
 * the reactivate path says the reason is cleared.
 *
 * The reason is required going in (`SuspendUserDto`) and optional coming out
 * (`ReactivateUserDto`) — mirrored exactly, because a console that demands
 * prose to undo a block is a console where people type "." to get past it.
 */
export function UserStatusActions({ user }: { user: AdminUserDetail }) {
  const queryClient = useQueryClient();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);

  const suspended = user.status.key === "suspended";

  // Mirrors `requireSuspendableUser()`. The API is the enforcer; this only
  // stops the console from offering an action it already knows will be refused.
  if (user.isStaff && !suspended) {
    return (
      <span className="text-[11px] text-fg-faint">
        Staff account — revoke the admin role to block access.
      </span>
    );
  }

  return (
    <>
      {suspended ? (
        <Button variant="secondary" size="sm" onClick={() => setReactivateOpen(true)}>
          <RotateCcw />
          Reactivate account
        </Button>
      ) : (
        <Button variant="danger" size="sm" onClick={() => setSuspendOpen(true)}>
          <Ban />
          Suspend account
        </Button>
      )}

      <ConfirmActionDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={`Suspend ${user.name}?`}
        description="They will not be able to sign in until an admin reactivates the account."
        confirmLabel="Suspend account"
        pendingLabel="Suspending…"
        tone="danger"
        reason="required"
        reasonLabel="Why is this account being suspended?"
        reasonHint="Stored on the account and in the audit log. Never shown to the suspended person."
        onStale={() => void invalidateAll(queryClient, USER_KEYS)}
        onConfirm={(reason) =>
          runModerationAction({
            queryClient,
            path: `/admin/users/${encodeURIComponent(user.id)}/suspend`,
            body: { reason },
            invalidate: USER_KEYS,
            success: `${user.name} can no longer sign in.`,
          }).then(() => undefined)
        }
      >
        <ContentStaysVisibleNote />
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title={`Reactivate ${user.name}?`}
        description="They will be able to sign in again immediately. The suspension reason is cleared from the account, but the audit entry for it stays."
        confirmLabel="Reactivate account"
        pendingLabel="Reactivating…"
        reason="optional"
        reasonLabel="Why is this being reversed?"
        reasonHint="Optional, and worth writing if this followed an appeal."
        onStale={() => void invalidateAll(queryClient, USER_KEYS)}
        onConfirm={(reason) =>
          runModerationAction({
            queryClient,
            path: `/admin/users/${encodeURIComponent(user.id)}/reactivate`,
            body: reason ? { reason } : {},
            invalidate: USER_KEYS,
            success: `${user.name} can sign in again.`,
          }).then(() => undefined)
        }
      />
    </>
  );
}

/** The sentence that stops a moderator expecting a takedown. */
export function ContentStaysVisibleNote() {
  return (
    <Alert tone="info" icon={Eye}>
      Suspension blocks sign-in only. Their reports, comments and impact stories stay visible to
      everyone. To take content down, remove it from Reports or Comments.
    </Alert>
  );
}
