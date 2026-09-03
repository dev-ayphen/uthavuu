"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, Eye, KeyRound, Pencil, RotateCcw, ShieldOff } from "lucide-react";
import { useState } from "react";

import { Alert, Button } from "@/components/ui";
import { ConfirmActionDialog } from "@/features/moderation/confirm-action-dialog";
import { invalidateAll } from "@/features/moderation/actions";
import type { AdminRoleRef } from "@/lib/roles";
import { ActionMenu, type MenuAction } from "./action-menu";
import { asAdminAccountError, isAdminAccountStale } from "./admin-errors";
import { ADMIN_ACCOUNT_KEYS, runAdminAccountAction } from "./api";
import { EditAdminDialog } from "./edit-admin-dialog";
import { ChangeOwnPasswordDialog, ResetPasswordDialog } from "./password-dialogs";
import { adminDetailHref } from "./routes";
import { roleOptions } from "./schema";
import { isSuspended, type AdminAccountDetail } from "./types";

/**
 * Everything an operator can do to an admin account — decided ONCE, rendered
 * two ways.
 *
 * WHY ONE COMPONENT AND NOT TWO
 * ───────────────────────────────────────────────────────────────────────────
 * The list needs a `⋮` menu and the detail page needs a row of buttons. The
 * tempting split is one component each, and it is wrong: the interesting part
 * of this file is not the buttons, it is `buildActions()` — the rules about who
 * may do what to whom, which are the same rules on both screens. Two copies of
 * those rules is two places to forget that you must never be offered "Suspend"
 * on your own row, and the copy that gets missed is the one nobody looks at.
 *
 * So the permission logic lives in `buildActions()` and `variant` decides only
 * how the resulting list is drawn.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULES, AND WHERE THEY ACTUALLY LIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * The API is the enforcer. Every rule below is MIRRORED for UX — so the console
 * never offers a control the server has already decided to refuse, which reads
 * as a broken console rather than as a boundary working correctly — and none of
 * it is security. Anyone can call the endpoints directly; the server says no.
 *
 *   YOURSELF (`isSelf`)         View details · Edit profile (DISABLED) ·
 *                               Change password.
 *
 *                               No suspend, no revoke, ever — not disabled,
 *                               ABSENT. A greyed-out "Suspend yourself" invites
 *                               the question "what if I did?", and there is no
 *                               answer worth putting on screen.
 *
 *                               "Edit profile" is the one that surprises people,
 *                               so it is disabled rather than absent. The API
 *                               has NO self-edit route: `update()` opens with
 *                               `assertNotSelf()` and answers 403
 *                               `CANNOT_MODIFY_SELF`, and there is no
 *                               `PATCH /admin/me` beside it. An operator who
 *                               simply found the item missing would hunt for it;
 *                               one who reads "ask another super admin" learns
 *                               the rule and knows who to ask. Changing your own
 *                               password IS available to everyone, including Ops
 *                               Admins — `POST /admin/me/change-password` carries
 *                               no `@RequireAdminPermissions` because it is
 *                               scoped by the session, not by a role.
 *
 *   ANOTHER ADMIN, super only   Edit · Reset password · Suspend/Reactivate ·
 *   (`canManage`)               Revoke access. All four sit behind
 *                               `platform:manage`, which only super_admin holds.
 *
 *   ANOTHER ADMIN, ops admin    View details only. The four write actions are
 *                               not rendered, because an ops admin has no route
 *                               to any of them — including the list itself.
 *
 *   LAST SUPER ADMIN            Suspend and Revoke render DISABLED with the
 *   (`isLastSuperAdmin`)        reason attached; the role field in the edit
 *                               dialog locks the same way. Disabled, never
 *                               hidden: an operator needs to learn the
 *                               constraint, not conclude the UI is broken. See
 *                               `MenuAction.disabledReason`.
 *
 * `isSelf` AND `isLastSuperAdmin` ARE THE SERVER'S ANSWERS — and the LIST
 * endpoint does not send either one yet, while the detail endpoint does (see
 * `./types.ts`). That gap has two different consequences, handled differently:
 *
 *   A missing `isSelf` reads as `false`, which would put "Suspend" and "Revoke"
 *   on the operator's OWN row. So `isSelf` is also derived from the session's
 *   own user id. That is not a second permission mechanism — it is the
 *   console's own identity, and it can only ever make the check MORE
 *   restrictive.
 *
 *   A missing `isLastSuperAdmin` has no such fallback. The rule counts super
 *   admins who can still SIGN IN — suspended ones excluded — which no client
 *   can compute from a list that carries no status. Guessing would be worse
 *   than not knowing: it would disable a legal action, or enable an illegal
 *   one, with equal confidence. So on the list it fails toward OFFERING, and
 *   the API refuses with `LAST_SUPER_ADMIN` inside the dialog that asked, whose
 *   message names the fix. On the DETAIL page the flag is real, so the buttons
 *   there are correct — which is one more reason the row links to it.
 */

export type AdminActionsVariant = "menu" | "buttons";

type DialogKind = "edit" | "reset" | "change-password" | "suspend" | "reactivate" | "revoke";

export function AdminAccountActions({
  admin,
  canManage,
  selfUserId,
  peers,
  variant,
  onRevoked,
}: {
  admin: AdminAccountDetail;
  /** Holds `platform:manage` — may act on OTHER admins. */
  canManage: boolean;
  /** The signed-in operator's user id, from the server session. */
  selfUserId: string | null;
  /**
   * Every admin currently on screen. Used only to harvest the API's own role
   * labels for the edit dialog's `<select>` — see `roleOptions()`.
   */
  peers: readonly AdminAccountDetail[];
  variant: AdminActionsVariant;
  /** Called after a successful revoke — the detail page navigates away. */
  onRevoked?: () => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogKind | null>(null);

  const isSelf = admin.isSelf === true || (selfUserId !== null && admin.userId === selfUserId);
  const roles: AdminRoleRef[] = roleOptions(peers, admin.role);

  const actions = buildActions({
    admin,
    isSelf,
    // `undefined` is a third answer, not a falsy "no" — see `buildActions`.
    statusKnown: admin.status?.key !== undefined,
    suspended: isSuspended(admin.status),
    canManage,
    includeViewDetails: variant === "menu",
    open: setDialog,
  });

  const base = `/admin/admins/${encodeURIComponent(admin.userId)}`;
  const onStale = () => void invalidateAll(queryClient, ADMIN_ACCOUNT_KEYS);

  /**
   * Refetch when the refusal means the row on screen is out of date, then
   * re-throw so `ConfirmActionDialog` still shows the API's own sentence next
   * to the button that caused it. `asAdminAccountError` re-words while keeping
   * the status and code the dialog branches on — see `./admin-errors.ts`.
   */
  const surfaceRefusal = (error: unknown): never => {
    if (isAdminAccountStale(error)) onStale();
    throw asAdminAccountError(error);
  };

  return (
    <>
      {variant === "menu" ? (
        <ActionMenu label={`Actions for ${admin.name}`} actions={actions} />
      ) : (
        <ButtonBar actions={actions} />
      )}

      {/* Every dialog below is mounted only when its state is selected, so
          `<Dialog>` builds a fresh subtree each time — no half-typed field or
          stale error can survive a close. */}

      {dialog === "edit" ? (
        <EditAdminDialog
          open
          onOpenChange={(open) => setDialog(open ? "edit" : null)}
          admin={admin}
          roles={roles}
        />
      ) : null}

      {dialog === "change-password" ? (
        <ChangeOwnPasswordDialog
          open
          onOpenChange={(open) => setDialog(open ? "change-password" : null)}
        />
      ) : null}

      {dialog === "reset" ? (
        <ResetPasswordDialog
          open
          onOpenChange={(open) => setDialog(open ? "reset" : null)}
          admin={admin}
        />
      ) : null}

      <ConfirmActionDialog
        open={dialog === "suspend"}
        onOpenChange={(open) => setDialog(open ? "suspend" : null)}
        title={`Suspend ${admin.name}'s console access?`}
        description="They stay an admin and keep their role, but cannot sign in to the console until this is lifted."
        confirmLabel="Suspend access"
        pendingLabel="Suspending…"
        tone="danger"
        // The contract declares `{ reason? }`. Optional here for the same
        // reason `ReactivateUserDto` is optional elsewhere: a console that
        // demands prose is a console where people type "." to get past it. The
        // hint says why it is worth writing anyway.
        reason="optional"
        reasonLabel="Why is this access being suspended?"
        reasonHint="Recorded against the account. Worth writing — the person who lifts this may not be you."
        onStale={onStale}
        onConfirm={(reason) =>
          runAdminAccountAction<AdminAccountDetail>({
            queryClient,
            path: `${base}/suspend`,
            body: reason ? { reason } : {},
            success: `${admin.name} can no longer sign in to the console.`,
          })
            .then(() => undefined)
            .catch(surfaceRefusal)
        }
      >
        <AccountSurvivesNote name={admin.name} />
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={dialog === "reactivate"}
        onOpenChange={(open) => setDialog(open ? "reactivate" : null)}
        title={`Restore ${admin.name}'s console access?`}
        description="They can sign in again immediately, with the role they already hold."
        confirmLabel="Restore access"
        pendingLabel="Restoring…"
        // `ReactivateAdminAccountSchema` accepts an optional `reason`, min 3 /
        // max 500 — the same bounds `ConfirmActionDialog`'s "optional" mode
        // already mirrors. Declaring "none" here would refuse to send something
        // the API accepts and records, which is the quieter of the two mistakes
        // and still a mistake.
        reason="optional"
        reasonLabel="Why is this being reversed?"
        reasonHint="Optional, and worth writing if this followed a request to restore access."
        onStale={onStale}
        onConfirm={(reason) =>
          runAdminAccountAction<AdminAccountDetail>({
            queryClient,
            path: `${base}/reactivate`,
            body: reason ? { reason } : {},
            success: `${admin.name} can sign in to the console again.`,
          })
            .then(() => undefined)
            .catch(surfaceRefusal)
        }
      />

      {/*
        REVOKE IS NOT DELETE, and the whole dialog exists to say so.

        `DELETE /admin/admins/:id` removes the ADMIN ROW — the grant that lets
        this person into the console. It does not touch their Uthavu account,
        their reports, their comments, the missions they volunteered for, or the
        audit entries naming them. An operator who reads "Delete" here and
        expects an account to disappear will either be surprised, or — far worse
        — will avoid revoking someone who should be revoked, because they think
        it destroys history.

        So the verb is "revoke", the title names the person, and the description
        says in one sentence what survives.
      */}
      <ConfirmActionDialog
        open={dialog === "revoke"}
        onOpenChange={(open) => setDialog(open ? "revoke" : null)}
        title={`Revoke ${admin.name}'s admin access?`}
        description="This removes their access to this console. It does not delete their account."
        confirmLabel="Revoke admin access"
        pendingLabel="Revoking…"
        tone="danger"
        reason="none"
        onStale={onStale}
        onConfirm={() =>
          runAdminAccountAction<void>({
            queryClient,
            path: base,
            method: "DELETE",
            success: `${admin.name} no longer has access to the console.`,
          })
            .then(() => {
              onRevoked?.();
            })
            .catch(surfaceRefusal)
        }
      >
        <RevokeIsNotDeleteNote name={admin.name} />
      </ConfirmActionDialog>
    </>
  );
}

/**
 * WHICH ACTIONS EXIST FOR THIS ROW. The only place that decides.
 *
 * Order is deliberate and identical on both surfaces: read, then edit, then
 * credential, then the two that take access away — separated, so a destructive
 * item is never adjacent to the one above it in muscle memory.
 */
function buildActions({
  admin,
  isSelf,
  statusKnown,
  suspended,
  canManage,
  includeViewDetails,
  open,
}: {
  admin: AdminAccountDetail;
  isSelf: boolean;
  /** False when the API did not report a status at all — see below. */
  statusKnown: boolean;
  suspended: boolean;
  canManage: boolean;
  includeViewDetails: boolean;
  open: (dialog: DialogKind) => void;
}): MenuAction[] {
  const actions: MenuAction[] = [];

  if (includeViewDetails) {
    actions.push({
      id: "view",
      label: "View details",
      icon: <Eye />,
      // A real link, not a scripted push — see `MenuAction.href`.
      href: adminDetailHref(admin.userId),
    });
  }

  // ── Your own row ─────────────────────────────────────────────────────────
  if (isSelf) {
    actions.push({
      id: "edit",
      label: "Edit profile",
      icon: <Pencil />,
      // Shown, not hidden, and disabled rather than allowed to 403. See the
      // header note: the API has no self-edit route at all.
      disabledReason:
        "The API doesn't let an admin edit their own account. Ask another super admin to change your name, email or role.",
      onSelect: () => open("edit"),
    });
    actions.push({
      id: "change-password",
      label: "Change password",
      icon: <KeyRound />,
      onSelect: () => open("change-password"),
    });
    // No suspend. No revoke. Absent, not disabled — see the header note.
    return actions;
  }

  // ── Someone else's row, and you may not act on it ────────────────────────
  if (!canManage) return actions;

  // ── Someone else's row, super admin ──────────────────────────────────────
  const lastSuperAdmin = admin.isLastSuperAdmin === true;
  const lockReason = lastSuperAdmin
    ? "This is the last super admin. Removing their access would leave the console with nobody able to manage it — promote someone else to Super Admin first."
    : undefined;

  actions.push({
    id: "edit",
    label: "Edit admin",
    icon: <Pencil />,
    onSelect: () => open("edit"),
  });
  actions.push({
    id: "reset",
    label: "Reset password",
    icon: <KeyRound />,
    onSelect: () => open("reset"),
  });

  if (!statusKnown) {
    /**
     * SUSPEND AND RESTORE ARE OPPOSITES, AND THE LIST CANNOT TELL THEM APART.
     *
     * Which of the two applies is decided entirely by `status`, and
     * `GET /admin/admins` does not return one (see `./types.ts`). Every way of
     * picking anyway is a guess dressed as a fact:
     *
     *   Default to "Suspend" — the common case — and a suspended admin gets an
     *   action that reads as new information ("so they're active") and is then
     *   refused as ALREADY_SUSPENDED. Worse, there is no way to restore anyone
     *   from this list at all: the item they need is the one never rendered.
     *
     *   Show both, and one of them is always wrong.
     *
     * So neither is offered, the reason is on screen rather than in a tooltip
     * only, and "View details" — two items above — goes to the page where the
     * status IS known and both buttons are correct. This branch deletes itself
     * the day `listAdmins()` returns a status.
     */
    actions.push({
      id: "access",
      label: "Suspend or restore access",
      icon: <Ban />,
      separated: true,
      disabledReason:
        "This list doesn't report whether access is currently suspended, so the console won't guess which of the two you meant. Open the account to see its status and act there.",
      onSelect: () => undefined,
    });
  } else if (suspended) {
    // Never blocked by the last-super-admin rule: restoring access cannot leave
    // the console without an administrator, it is the cure for that.
    actions.push({
      id: "reactivate",
      label: "Restore access",
      icon: <RotateCcw />,
      separated: true,
      onSelect: () => open("reactivate"),
    });
  } else {
    actions.push({
      id: "suspend",
      label: "Suspend access",
      icon: <Ban />,
      tone: "danger",
      separated: true,
      disabledReason: lockReason,
      onSelect: () => open("suspend"),
    });
  }

  // Revoke does not depend on the status — a suspended admin can be revoked
  // and an active one can too — so it stays available even where the pair above
  // could not be resolved.
  actions.push({
    id: "revoke",
    label: "Revoke access",
    icon: <ShieldOff />,
    tone: "danger",
    disabledReason: lockReason,
    onSelect: () => open("revoke"),
  });

  return actions;
}

/**
 * The same action list as buttons, for the detail page.
 *
 * "View details" is filtered out rather than never built: the caller passes
 * `includeViewDetails: false`, so this is belt and braces against a link to the
 * page you are already on.
 *
 * A disabled `<button>` shows no `title` in most browsers and is skipped by the
 * keyboard, so the tooltip goes on a wrapping `<span>` and the reason is also
 * available to assistive tech as `sr-only` text. The detail page states the
 * same rule in prose above the buttons; nothing here is hover-only.
 */
function ButtonBar({ actions }: { actions: readonly MenuAction[] }) {
  return (
    <>
      {actions
        .filter((action) => !action.href)
        .map((action) => (
          <ActionButton key={action.id} action={action} />
        ))}
    </>
  );
}

function ActionButton({ action }: { action: MenuAction }) {
  const disabled = Boolean(action.disabledReason);

  const button = (
    <Button
      variant={action.tone === "danger" ? "danger" : "secondary"}
      size="sm"
      disabled={disabled}
      onClick={() => action.onSelect?.()}
    >
      {action.icon}
      {action.label}
      {action.disabledReason ? (
        <span className="sr-only"> — unavailable. {action.disabledReason}</span>
      ) : null}
    </Button>
  );

  if (!action.disabledReason) return button;

  return (
    <span title={action.disabledReason} className="inline-flex">
      {button}
    </span>
  );
}

/** What suspension does and does not do. */
function AccountSurvivesNote({ name }: { name: string }) {
  return (
    <Alert tone="info" icon={Eye}>
      This blocks the console only. {name} keeps their admin role, their Uthavu account, and
      everything they have already done — the audit entries with their name on them do not move.
    </Alert>
  );
}

/** The sentence that stops "Revoke" being read as "Delete". */
function RevokeIsNotDeleteNote({ name }: { name: string }) {
  return (
    <Alert tone="info" icon={Eye}>
      <strong className="font-bold">This is not a deletion.</strong> {name} keeps their Uthavu
      account and can still use the mobile app; their reports, comments and completed missions stay
      exactly where they are, and every audit entry naming them is untouched. What is removed is the
      grant that lets them into this console — a super admin can give it back.
    </Alert>
  );
}
