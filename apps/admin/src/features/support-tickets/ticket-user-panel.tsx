"use client";

import Link from "next/link";
import { ExternalLink, Phone } from "lucide-react";

import { PersonCell } from "@/components/data";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { reportDetailHref, userDetailHref } from "@/features/moderation/routes";

import { UserStatusBadge } from "./badges";
import type { SupportTicketDetail } from "./types";

/**
 * Who filed this, and the one link out of it.
 *
 * WHY THE PHONE NUMBER IS HERE
 * ───────────────────────────────────────────────────────────────────────────
 * It is an admin-only projection behind `platform:manage` and it is never
 * reachable from a citizen route. Staff need it because a support ticket about
 * a failed OTP or a locked account cannot be resolved in the app the person
 * cannot get into. It is rendered as a `tel:` link so following up is one click
 * rather than a retype, and marked `dir="ltr"` so an Indian number keeps its
 * digits in order regardless of the surrounding text.
 *
 * WHY THE ACCOUNT STATUS IS HERE
 * ───────────────────────────────────────────────────────────────────────────
 * `active` / `suspended` (ADR 0011). A complaint from someone whose account is
 * suspended reads completely differently — often it IS the complaint — and an
 * agent who cannot see it will answer the wrong question and then be surprised
 * when the citizen says they still cannot sign in.
 *
 * WHAT THIS PANEL DELIBERATELY DOES NOT DO
 * ───────────────────────────────────────────────────────────────────────────
 * `relatedReportId` renders as A LINK AND NOTHING ELSE. No title, no category,
 * no photo, no excerpt — and under no circumstances the report's Mission Chat.
 * ADR 0010 makes mission chat unreadable by admins, and `tickets-schema.ts`
 * says the same about this column: holding a report id here grants no access to
 * that report's conversation. The API agrees and sends nothing but the id.
 *
 * The temptation is real, because "show the report title so the agent knows
 * what it is about" sounds helpful and costs one join. It is exactly how a
 * privacy boundary gets relocated into a screen nobody reviewed for it. An
 * agent who needs the report opens the report, where the report's own rules
 * apply.
 */
export function TicketUserPanel({ ticket }: { ticket: SupportTicketDetail }) {
  const { user } = ticket;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raised by</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <PersonCell
          person={{ id: user.id, name: user.name, avatarUrl: user.avatarUrl }}
          secondary={null}
        />

        <dl className="space-y-3">
          <div>
            <dt className="micro-label">Phone</dt>
            <dd className="mt-1">
              {user.phone ? (
                <a
                  href={`tel:${user.phone}`}
                  dir="ltr"
                  className="tabular inline-flex items-center gap-1.5 rounded-control text-fg hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Phone aria-hidden className="size-3.5 text-fg-faint" />
                  {user.phone}
                </a>
              ) : (
                <span className="text-fg-faint">No number on file</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="micro-label">Account</dt>
            <dd className="mt-1">
              <UserStatusBadge status={user.status} />
            </dd>
          </div>

          {ticket.relatedReportId ? (
            <div>
              <dt className="micro-label">Related request</dt>
              <dd className="mt-1">
                <Link
                  href={reportDetailHref(ticket.relatedReportId)}
                  className="inline-flex items-center gap-1.5 rounded-control text-sm font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Open the request
                  <ExternalLink aria-hidden className="size-3.5" />
                </Link>
                <p className="mt-1 text-xs text-fg-faint">
                  This ticket refers to a request. Nothing from it is shown here — open it to see
                  it, where its own rules apply.
                </p>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="border-t border-border pt-3">
          <Link
            href={userDetailHref(user.id)}
            className="inline-flex items-center gap-1.5 rounded-control text-xs font-semibold text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            View this citizen&rsquo;s account
            <ExternalLink aria-hidden className="size-3" />
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
