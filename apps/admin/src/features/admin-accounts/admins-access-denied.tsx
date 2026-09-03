"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";

import { AccessDeniedState, Button } from "@/components/ui";
import { ACCESS_DENIED } from "@/lib/access-denied-copy";
import { ChangeOwnPasswordDialog } from "./password-dialogs";

/**
 * What an ops admin sees on this section.
 *
 * The only refusal in the console that is still a component rather than a line
 * of copy in `@/lib/access-denied-copy`, because it owns dialog state.
 *
 * WHY IT CARRIES AN ACTION WHERE THE OTHERS DO NOT
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
      <AccessDeniedState
        {...ACCESS_DENIED.admins}
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
