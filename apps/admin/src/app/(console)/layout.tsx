import { redirect } from "next/navigation";

import { AppLayout } from "@/components/layout/app-layout";
import { AccessDenied } from "@/components/layout/access-denied";
import { getAdminSessionResult } from "@/lib/session";

/**
 * The protected area.
 *
 * Everything under `(console)` renders inside the shell, so no page carries its
 * own auth check — the guard belongs here, once. It fails CLOSED: the only path
 * that renders children is a verified session.
 *
 * The three denials are deliberately NOT collapsed into one redirect:
 *
 *   signed-out  -> /login, the ordinary case.
 *   not-admin   -> an explanation. Redirecting here would loop: they hold a
 *                  valid session, so /login would send them straight back.
 *   unreachable -> an outage, not an auth failure. Telling someone to sign in
 *                  when the API is down blames them for it, and they would
 *                  sign in successfully and land right back here.
 *
 * The session's `permissions` go to the shell so the sidebar can hide sections
 * this operator cannot use. That is UX only and adds NO enforcement here: every
 * page below is still reachable by URL and every API route still carries its
 * own `@RequireAdminPermissions`. This layout's only security job is the one it
 * already did — proving there is an admin session at all.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { session, denial } = await getAdminSessionResult();

  if (denial === "signed-out") redirect("/login");

  if (!session) {
    return <AccessDenied denial={denial} />;
  }

  return (
    <AppLayout
      session={{ name: session.name, role: session.role }}
      permissions={session.permissions}
    >
      {children}
    </AppLayout>
  );
}
