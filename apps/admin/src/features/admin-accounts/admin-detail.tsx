"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import {
  DetailBody,
  DetailField,
  DetailFields,
  DetailHeader,
  DetailSection,
  DetailSkeleton,
  formatDate,
} from "@/components/data";
import { CalloutCard } from "@/components/ui";
import { DetailFallback } from "@/features/moderation/detail-query";
import { AdminAccountActions } from "./admin-actions";
import { AdminRoleBadge, AdminStatusBadge, LastSuperAdminBadge, YouBadge } from "./badges";
import { ADMINS_INDEX } from "./routes";
import { humanizeRoleKey } from "./schema";
import { readLastLogin } from "./types";
import { useAdminAccount } from "./use-admin-accounts";

/**
 * One admin account.
 *
 * Fetched client-side rather than in the server page so that edit, suspend,
 * reactivate and revoke can invalidate and re-render in place — the same split
 * `features/users/user-detail.tsx` and `features/announcements/update-editor.tsx`
 * make, and for the same reason.
 *
 * BRANCH ORDER IS THE HOOK'S, NOT THIS COMPONENT'S. `useDetailQuery` resolves
 * loading -> failure -> not-found -> ready into a single `view.kind`, so a
 * failed request cannot render "no such admin" — a very different thing to tell
 * an operator than "the API is down".
 *
 * THE SAME ACTIONS AS THE LIST, FROM THE SAME PLACE. `AdminAccountActions`
 * renders `variant="buttons"` here and `variant="menu"` in the table; both read
 * one `buildActions()`, so the rules about who may do what to whom cannot drift
 * between the two screens.
 */
export function AdminDetail({
  userId,
  canManage,
  selfUserId,
}: {
  userId: string;
  canManage: boolean;
  selfUserId: string | null;
}) {
  const router = useRouter();
  const { view } = useAdminAccount(userId);

  if (view.kind === "loading") return <DetailSkeleton fields={6} />;

  if (view.kind !== "ready") {
    return (
      <DetailFallback
        view={view}
        notFoundTitle="No such admin account"
        notFoundDescription="This account no longer has console access. The link may be from before it was revoked."
        backHref={ADMINS_INDEX}
        backLabel="Back to admin accounts"
      />
    );
  }

  const admin = view.record;
  const isSelf = admin.isSelf === true || (selfUserId !== null && admin.userId === selfUserId);
  const lastLogin = readLastLogin(admin.lastLoginAt);

  return (
    <DetailBody>
      <DetailHeader
        backHref={ADMINS_INDEX}
        backLabel="Back to admin accounts"
        eyebrow={isSelf ? "Your account" : "Console staff"}
        title={admin.name}
        subtitle={<span className="text-xs">{admin.email}</span>}
        badges={
          <>
            <AdminRoleBadge role={admin.role} />
            <AdminStatusBadge status={admin.status} />
            {isSelf ? <YouBadge /> : null}
            {admin.isLastSuperAdmin ? <LastSuperAdminBadge /> : null}
          </>
        }
        actions={
          <AdminAccountActions
            admin={admin}
            canManage={canManage}
            selfUserId={selfUserId}
            // The edit dialog reads role labels off the records it has; here
            // that is the one record on screen, plus the contract's known keys.
            peers={[admin]}
            variant="buttons"
            // Nothing to return to once the grant is gone. `replace`, so the
            // back button does not land on a detail page for an account that no
            // longer has console access.
            onRevoked={() => router.replace(ADMINS_INDEX)}
          />
        }
      />

      {/*
        The constraint, in prose, above the buttons it disables. The tooltip on
        a disabled button is required and is not sufficient on its own: it is
        mouse-only and it vanishes. An operator who has come here specifically
        to remove this person needs to read WHY they cannot, and what to do
        instead, without hunting for it.
      */}
      {admin.isLastSuperAdmin ? (
        <CalloutCard tone="warning" icon={ShieldAlert} title="This is the last super admin">
          Suspending this account, revoking its access, or moving it to another role would leave
          the console with nobody able to manage admin accounts — including nobody able to undo it.
          The API refuses all three, and this page does not offer them. Promote someone else to
          Super Admin first and every one of them unlocks by itself.
        </CalloutCard>
      ) : null}

      <DetailSection
        title="Account"
        description="What this person is, and what the console knows about their access."
      >
        <DetailFields columns={3}>
          <DetailField label="Full name">
            <span className="text-fg">{admin.name}</span>
          </DetailField>
          <DetailField label="Email">
            {/* Also the sign-in identifier, so it is worth being able to select
                and copy rather than truncating it into a tooltip. */}
            <span className="break-all text-fg">{admin.email}</span>
          </DetailField>
          <DetailField label="Role">
            <span className="flex flex-wrap items-center gap-1.5">
              <AdminRoleBadge role={admin.role} />
              <span className="text-[11px] text-fg-faint">
                {admin.role?.key ? humanizeRoleKey(admin.role.key) : ""}
              </span>
            </span>
          </DetailField>
          <DetailField label="Console access">
            <AdminStatusBadge status={admin.status} />
          </DetailField>
          <DetailField label="Added">
            <span className="tabular text-fg">{formatDate(admin.createdAt, true) ?? "—"}</span>
          </DetailField>
          <DetailField label="Last login">
            {/* Three states, never two. `null` is "has never signed in" and is
                a real audit finding; a MISSING field is not, and must not be
                laundered into one. See `readLastLogin`. */}
            {lastLogin.kind === "at" ? (
              <span className="tabular text-fg">{formatDate(lastLogin.iso, true) ?? "—"}</span>
            ) : lastLogin.kind === "never" ? (
              <span className="text-warning-fg">Never</span>
            ) : (
              <span
                className="text-fg-faint"
                title="The API returned no last-login time for this account."
              >
                Not reported
              </span>
            )}
          </DetailField>
          <DetailField label="Account id" span={3}>
            <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
              {admin.userId}
            </code>
          </DetailField>
        </DetailFields>
      </DetailSection>
    </DetailBody>
  );
}
