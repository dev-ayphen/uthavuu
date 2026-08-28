import { ShieldCheck, ShieldAlert } from "lucide-react";

import { PageLayout } from "@/components/layout";
import { Badge, Card, CardBody, EmptyState, ErrorState } from "@/components/ui";
import { ApiError } from "@/lib/api-error";
import { serverApiFetch } from "@/lib/server-api";

export const metadata = { title: "Admin Accounts" };

type AdminAccount = {
  userId: string;
  name: string;
  email: string;
  role: { key: string; label: string };
  createdAt: string;
};

/**
 * Who can sign in to this console.
 *
 * `GET /admin/admins` requires `platform:manage`, which only super_admin holds.
 * An ops admin therefore gets a 403 here — an expected, correct outcome, not a
 * failure. It is rendered as "you don't have permission" rather than an error
 * state, because an ops admin seeing a red "something went wrong" would
 * reasonably report a bug against a system that is working as designed.
 */
export default async function Page() {
  let admins: AdminAccount[] | null = null;
  let denied = false;
  let failure: string | null = null;

  try {
    admins = await serverApiFetch<AdminAccount[]>("/admin/admins");
  } catch (error) {
    if (error instanceof ApiError && error.code === "ADMIN_MISSING_PERMISSION") {
      denied = true;
    } else {
      failure = error instanceof Error ? error.message : "Couldn't load admin accounts.";
    }
  }

  return (
    <PageLayout
      eyebrow="Access"
      title="Admin Accounts"
      subtitle="Who can sign in to this console, and what each of them can do."
      breadcrumb={[{ label: "Console", href: "/dashboard" }, { label: "Admin" }]}
      actions={admins ? <Badge tone="neutral">{admins.length} accounts</Badge> : null}
    >
      {denied ? (
        <EmptyState
          icon={<ShieldAlert className="size-5" />}
          title="Only super admins can view this"
          description="Your account can moderate reports, comments and users, but managing console access is restricted. Ask a super admin if you need this."
        />
      ) : failure ? (
        <ErrorState message={failure} />
      ) : !admins || admins.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-5" />}
          title="No admin accounts"
          description="Accounts are created by the API's seed step, not from this console."
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {admins.map((admin) => (
                <li
                  key={admin.userId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{admin.name}</p>
                    <p className="truncate text-xs text-fg-subtle">{admin.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-fg-faint">
                      Added {formatDate(admin.createdAt)}
                    </span>
                    {/* The API authors the label; the console keeps no key->label
                        map of its own. A role added server-side shows its real
                        name here without a redeploy. */}
                    <Badge tone={admin.role.key === "super_admin" ? "primary" : "neutral"}>
                      {admin.role.label}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </PageLayout>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  // Fixed locale/zone: this renders on the server, and letting it vary by the
  // server's environment makes the same row read differently between deploys.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
