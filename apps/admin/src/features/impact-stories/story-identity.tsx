"use client";

import Link from "next/link";
import { EyeOff, UserX } from "lucide-react";

import { EmptyCell, PersonCell } from "@/components/data";
import { Badge } from "@/components/ui";
import { userDetailHref } from "@/features/moderation/routes";
import type { ImpactStoryListItem } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "DELETED ACCOUNT" AND "POSTED ANONYMOUSLY" ARE DIFFERENT FACTS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file exists because they are easy to conflate and expensive to conflate.
 * `docs/architecture/data.md`, invariant 3, states it directly: the API carries
 * `reporter: null` AND a separate `reporterDeleted` flag, and the two "must
 * never be conflated in any UI, admin included."
 *
 * What each one actually means to the person reading the screen:
 *
 *   reporterDeleted     The account is GONE. `reports.reporter_id` is SET NULL
 *                       on account deletion, so the story survived its author.
 *                       There is nobody to contact, nothing to link to, and no
 *                       profile to open. Support cannot follow up on this story.
 *
 *   reporterAnonymous   The account EXISTS and the person is contactable. They
 *                       chose not to be named to other citizens — a display
 *                       preference on a live account, not an absence.
 *
 * Collapse them into one grey "Unknown" and a moderator handling a complaint
 * either wastes an afternoon looking for a user who no longer exists, or —
 * worse — publishes the name of someone who asked not to be named, because the
 * console never told them the request had been made.
 *
 * They are also not mutually exclusive. A person can post anonymously and then
 * delete their account, so both flags can be true on one row. Both are rendered.
 *
 * The four states, spelled out:
 *
 *   deleted                            "Deleted account"      (+ anon chip if also anonymous)
 *   named + anonymous                  the name, + "anon" chip explaining citizens don't see it
 *   named                              the name, linked to their profile
 *   no name, not deleted, not anon     an em dash. We do not know, and we say so
 *                                      rather than picking the scarier answer.
 *
 * The console DOES see an anonymous reporter's name — matching
 * `AdminReportsService.reporterProjection()` and the Reports table's `anon`
 * chip. That is a provisional call (open question 2, not settled): staff see the
 * identity with an explicit flag, because `GET /admin/users/:id` already lists a
 * user's anonymous reports and hiding it on one screen while the next screen
 * shows it is theatre, not protection. If the owner rules the other way, the API
 * stops sending the name and the `named + anonymous` branch below simply
 * collapses into the `anonymous, no name` one — no change needed here.
 */

/** Marks a row whose author citizens do not see by name. */
function AnonymousChip({ compact = false }: { compact?: boolean }) {
  return (
    <Badge
      tone="neutral"
      title="Posted anonymously — citizens never see this name. The account still exists."
      className="shrink-0"
    >
      <EyeOff aria-hidden className="size-2.5" />
      {compact ? "anon" : "Anonymous to citizens"}
    </Badge>
  );
}

/**
 * The reporter, rendered in a table cell.
 *
 * `PersonCell`'s own `deleted` branch is reused rather than re-drawn, so a
 * deleted reporter looks identical here, on Reports, and on Comments. One
 * visual for one fact.
 */
export function StoryReporterCell({
  story,
  linkToProfile = true,
}: {
  story: Pick<ImpactStoryListItem, "reporter" | "reporterDeleted" | "reporterAnonymous">;
  linkToProfile?: boolean;
}) {
  const { reporter, reporterDeleted, reporterAnonymous } = story;

  // Deleted first: it is the fact that removes every affordance below it.
  // The anonymity chip still rides along, because "they asked not to be named"
  // stays true about the published story after the account is gone.
  if (reporterDeleted) {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <PersonCell person={{ deleted: true }} />
        {reporterAnonymous ? <AnonymousChip compact /> : null}
      </span>
    );
  }

  // Anonymous with no name is a WITHHELD identity, not a missing one, and it
  // gets its own words — never the deleted-account glyph.
  if (!reporter) {
    if (reporterAnonymous) {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-3 text-fg-faint">
            <EyeOff className="size-3" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-fg-subtle italic">Posted anonymously</span>
            <span className="block truncate text-[11px] text-fg-faint">Account still active</span>
          </span>
        </span>
      );
    }
    // Not deleted, not anonymous, and still no name: we genuinely do not know.
    // An em dash is the only honest thing to draw.
    return <EmptyCell />;
  }

  const person = <PersonCell person={{ id: reporter.id, name: reporter.name }} />;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {linkToProfile ? (
        <Link
          href={userDetailHref(reporter.id)}
          className="inline-flex min-w-0 rounded-control hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {person}
        </Link>
      ) : (
        person
      )}
      {reporterAnonymous ? <AnonymousChip compact /> : null}
    </span>
  );
}

/**
 * The helper who submitted the completion.
 *
 * There is no anonymity concept for helpers anywhere in the contract or the
 * schema, so there is none here either. `completed_by_id` is always written at
 * completion time, which makes `helperDeleted` mean exactly one thing: they
 * deleted their account and SET NULL took the identity while leaving the
 * completion as community history.
 */
export function StoryHelperCell({
  story,
  linkToProfile = true,
}: {
  story: Pick<ImpactStoryListItem, "helper" | "helperDeleted">;
  linkToProfile?: boolean;
}) {
  const { helper, helperDeleted } = story;

  if (helperDeleted) return <PersonCell person={{ deleted: true }} />;
  if (!helper) return <EmptyCell />;

  const person = <PersonCell person={{ id: helper.id, name: helper.name }} />;
  if (!linkToProfile) return person;

  return (
    <Link
      href={userDetailHref(helper.id)}
      className="inline-flex min-w-0 rounded-control hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {person}
    </Link>
  );
}

/**
 * The volunteer roster's identity cell.
 *
 * `userId` and `name` are null together — the service nulls the name whenever
 * the id is null, precisely so a stale name never appears beside a missing
 * profile. `UserX` here reads the same as `PersonCell`'s deleted branch.
 */
export function VolunteerIdentity({
  userId,
  name,
}: {
  userId: string | null;
  name: string | null;
}) {
  if (!userId) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-3 text-fg-faint">
          <UserX className="size-3" aria-hidden />
        </span>
        <span className="text-fg-faint italic">Deleted account</span>
      </span>
    );
  }

  return (
    <Link
      href={userDetailHref(userId)}
      className="inline-flex min-w-0 rounded-control hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PersonCell person={{ id: userId, name }} />
    </Link>
  );
}
