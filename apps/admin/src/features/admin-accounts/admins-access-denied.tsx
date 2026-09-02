"use client";

import { KeyRound, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Button, EmptyState } from "@/components/ui";
import { ChangeOwnPasswordDialog } from "./password-dialogs";

/**
 * What an ops admin sees on this section.
 *
 * An EmptyState, NOT an ErrorState — the same call
 * `features/announcements/updates-access-denied.tsx` makes for the same reason.
 * A red "something went wrong" over a correctly-enforced permission invites an
 * operator to file a bug against the system working as designed, and it hides
 * the one useful next step: knowing who to ask.
 *
 * WHY IT CARRIES AN ACTION WHERE THE ANNOUNCEMENTS VERSION DOES NOT
 * ───────────────────────────────────────────────────────────────────────────
 * `platform:manage` gates the LIST and everything done to another admin. It
 * does not gate the two things an admin does to themselves — and one of those,
 * changing your own password, has no other home in this console. Without this
 * button, an ops admin who wanted to rotate their own password would follow the
 * nav to Admin, be told they may not be here, and have nowhere left to go: the
 * capability exists, the endpoint is open to them, and the only door to it is
 * on a page they cannot read.
 *
 * So the refusal is scoped to what is actually refused. "You may not manage
 * other people's accounts" and "you may not manage your own" are different
 * sentences, and only the first one is true.
 */
export function AdminsAccessDenied() {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  return (
    <>
      <EmptyState
        icon={<ShieldAlert className="size-10" />}
        title="Only super admins can manage console access"
        description="Your role covers moderation — reports, comments and community members — but adding, suspending or removing admin accounts is restricted. Ask a super admin if you need this. You can still change your own password."
        action={
          <Button variant="secondary" size="sm" onClick={() => setChangePasswordOpen(true)}>
            <KeyRound />
            Change my password
          </Button>
        }
      />

      {changePasswordOpen ? (
        <ChangeOwnPasswordDialog open onOpenChange={setChangePasswordOpen} />
      ) : null}
    </>
  );
}

/**
 * "Change my password", for the page header.
 *
 * A super admin has their own row in the table below and could reach this from
 * its `⋮` menu — but finding your own name in a list to change your password is
 * a scavenger hunt, and it is the one action on this page that is about the
 * person using it rather than about somebody else. It gets a permanent home.
 */
export function ChangeMyPasswordButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <KeyRound />
        Change my password
      </Button>
      {open ? <ChangeOwnPasswordDialog open onOpenChange={setOpen} /> : null}
    </>
  );
}
