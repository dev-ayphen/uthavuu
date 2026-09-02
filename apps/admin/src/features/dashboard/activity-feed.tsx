"use client";

import { EyeOff, History, PlugZap, RotateCcw, ShieldOff, UserX } from "lucide-react";

import {
  CodeCell,
  EmptyCell,
  formatDate,
  ListFailureState,
  PersonCell,
  RelativeTime,
} from "@/components/data";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  activityHref,
  activityKey,
  describeActivity,
  type ActivityItem,
} from "./activity-types";
import { PanelFootnote, PanelRow, PanelRowSkeleton, PanelScroll } from "./panel";
import { useActivityFeed } from "./use-activity-feed";

/**
 * Live activity — the newest things that happened on the platform.
 *
 * Every row is something the API said happened. There is no filler: when the
 * feed has nothing it says so, when the endpoint is not deployed it says that
 * instead, and when a request fails it says THAT — three different sentences,
 * because they call for three different responses from the person reading them.
 *
 * SCROLL OWNERSHIP
 * ───────────────────────────────────────────────────────────────────────────
 * The card is bounded; the list scrolls inside it, so loading twenty more rows
 * never pushes the tiles above off the page. The scroll pane carries `min-h-0`
 * because a flex child defaults to `min-height: auto` and will not shrink below
 * its content — without it `overflow-y-auto` never engages, the scroll escapes
 * to the document, and the card header slides away with the rows.
 *
 * The row shell, the chip palette and the skeleton live in ./panel, shared with
 * the two moderation panels beside this one so all three cannot drift into
 * three slightly different rows on a single screen.
 */

export function ActivityFeed({ className }: { className?: string }) {
  const { view, scope, hasNextPage, isFetchingNextPage, isFetching, fetchNextPage, refetch } =
    useActivityFeed();

  return (
    // Bounded height + `flex flex-col` is what gives the pane below something
    // to be 100%-of. svh, never vh: mobile browser chrome makes vh lie.
    <Card className={cn("flex h-[26rem] max-h-[80svh] flex-col", className)}>
      <CardHeader className="shrink-0">
        <CardTitle>
          <History className="size-4 text-primary" />
          Live activity
        </CardTitle>
        {/* Not in "failure" — ListFailureState carries its own retry, and two
            of them disagree about which one worked. Kept in "unavailable" on
            purpose: the endpoint is landing in parallel, and this is how an
            operator picks it up without reloading the console. */}
        {view.kind !== "loading" && view.kind !== "failure" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={isFetching}
            className="-mr-1.5"
          >
            <RotateCcw className={cn(isFetching && "animate-spin")} />
            <span className="sr-only">Refresh activity</span>
          </Button>
        ) : null}
      </CardHeader>

      {/* min-h-0 lets this shrink inside the bounded card; without it the pane
          grows to fit its rows and the whole document scrolls instead. */}
      <CardBody className="flex min-h-0 flex-1 flex-col px-0 pb-3">
        {view.kind === "loading" ? (
          <PanelRowSkeleton rows={5} />
        ) : view.kind === "unavailable" ? (
          <EmptyState
            className="my-auto mx-4 py-8"
            icon={<PlugZap className="size-8" />}
            title="Activity feed isn’t live yet"
            description="The console is wired to GET /admin/activity, but the API doesn’t serve that route yet. Real events will appear here the moment it ships — nothing in the console has to change."
          />
        ) : view.kind === "failure" ? (
          <div className="my-auto px-4">
            <ListFailureState failure={view.failure} onRetry={refetch} />
          </div>
        ) : view.kind === "empty" ? (
          <EmptyState
            className="my-auto mx-4 py-8"
            icon={<History className="size-8" />}
            title="No activity yet"
            description="Nothing has happened on the platform yet — no requests, missions, updates or sign-ups. Real events appear here as they happen."
          />
        ) : (
          <PanelScroll>
            <ul className="divide-y divide-border">
              {view.items.map((item) => (
                <li key={activityKey(item)}>
                  <ActivityRow item={item} />
                </li>
              ))}
            </ul>

            {hasNextPage ? (
              <div className="px-4 pt-3 text-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchNextPage}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : (
              // Says the list is complete rather than leaving the operator to
              // wonder whether more was silently withheld.
              <PanelFootnote>That’s everything the API has.</PanelFootnote>
            )}

            {/* An ops admin's feed genuinely omits moderation rows — reading the
                audit trail is a super-admin capability. Saying so is the whole
                point of the API returning the flag: an unexplained short feed
                is indistinguishable from a broken one. */}
            {!scope.includesAdminActions ? (
              <p className="mt-2 flex items-start gap-1.5 border-t border-border px-4 pt-3 text-[11px] text-fg-faint">
                <ShieldOff aria-hidden className="mt-px size-3 shrink-0" />
                <span>
                  Admin actions aren’t shown in your feed — reading the audit trail needs super-admin
                  access. Everything else is here.
                </span>
              </p>
            ) : null}
          </PanelScroll>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * `activityHref` returns null for targets this console has no page for, and
 * `PanelRow` renders those as plain text: a dead <a> that navigates nowhere is
 * worse than no link at all.
 */
function ActivityRow({ item }: { item: ActivityItem }) {
  const { icon: Icon, accent } = describeActivity(item.type);
  const href = activityHref(item);

  return (
    <PanelRow
      href={href}
      accent={accent}
      icon={<Icon className="size-3.5" />}
      meta={
        item.occurredAt ? (
          // The absolute IST time on hover: "2 hours ago" is the scannable
          // form, but reconciling it against a log needs the real timestamp.
          <span title={formatDate(item.occurredAt, true) ?? undefined}>
            <RelativeTime value={item.occurredAt} />
          </span>
        ) : (
          <EmptyCell />
        )
      }
    >
      <ActivitySentence item={item} />
      {item.targetLabel ? (
        <span className="mt-0.5 block truncate text-fg-subtle" title={item.targetLabel}>
          {item.targetLabel}
        </span>
      ) : null}
    </PanelRow>
  );
}

/**
 * "<who> <did what>", or "<what happened>" when there is no who.
 *
 * FOUR DISTINCT FACTS, FOUR DISTINCT RENDERS
 * ───────────────────────────────────────────────────────────────────────────
 *   a name              the person — including one whose account is gone, see
 *                       below — followed by what they did
 *   anonymous, no name  "Posted anonymously": the account EXISTS and the person
 *                       is contactable. data.md invariant 3 forbids conflating
 *                       this with deletion, and the glyphs differ accordingly.
 *   deleted, no name    "Deleted account" — all that is left to say
 *   nothing at all      no subject, and an impersonal verb rather than a fake
 *                       one ("Help request raised")
 *
 * A blank where the name should be is the one thing this must never render: it
 * reads as missing data and sends an operator hunting for a bug.
 *
 * WHY A DELETED ACTOR CAN STILL HAVE A NAME
 * ───────────────────────────────────────────────────────────────────────────
 * An `admin.action` snapshots the actor's name at write time and nulls the id
 * on deletion, so a departed admin's entries stay readable. Collapsing that to
 * "Deleted account" would discard the one piece of information the API went out
 * of its way to preserve. `/platform/audit-logs` — the same rows, one click
 * away — keeps the name and marks the account removed, so this does too. The
 * two views of one event must not disagree about who caused it.
 */
function ActivitySentence({ item }: { item: ActivityItem }) {
  const { verb, impersonal, known } = describeActivity(item.type);

  // `detail.label` is the audit action's own words — "Hide report", "Suspend
  // user". The API sends it precisely so moderation rows don't all collapse
  // into "took an admin action", which is noise rather than activity.
  const said = item.detail?.label ?? verb;

  // An unrecognised event type shows the API's raw key. See `describeActivity`.
  const action = known ? (
    <span className="text-fg-subtle">{said}</span>
  ) : (
    <CodeCell value={item.type} truncate={false} />
  );

  const line = "flex flex-wrap items-center gap-x-1.5 gap-y-0.5";

  if (item.actor) {
    return (
      <span className={line}>
        {/* `id` may be null, so PersonCell gets the name alone — it is the
            name, not the id, that answers "who did this". */}
        <PersonCell person={{ name: item.actor.name }} showAvatar={false} />
        {item.actorDeleted ? <AccountRemovedChip /> : null}
        {item.actorAnonymous ? <AnonymousChip /> : null}
        {action}
      </span>
    );
  }

  if (item.actorAnonymous) {
    return (
      <span className={line}>
        <span
          className="flex items-center gap-1.5 text-fg-subtle italic"
          title="Posted anonymously — the account still exists; citizens never see this name."
        >
          <EyeOff aria-hidden className="size-3 shrink-0 text-fg-faint" />
          Posted anonymously
        </span>
        {action}
      </span>
    );
  }

  if (item.actorDeleted) {
    return (
      <span className={line}>
        <PersonCell person={{ deleted: true }} />
        {action}
      </span>
    );
  }

  return (
    <span className={line}>
      {known ? <span className="font-medium text-fg">{impersonal}</span> : action}
      <span className="text-[11px] text-fg-faint">no actor recorded</span>
    </span>
  );
}

/** Matches `/platform/audit-logs`, where these same rows are read in full. */
function AccountRemovedChip() {
  return (
    <Badge tone="neutral" title="This account no longer exists. The entry is kept.">
      <UserX className="size-2.5" aria-hidden />
      Account removed
    </Badge>
  );
}

/** The account exists; the name is withheld from citizens, not from staff. */
function AnonymousChip() {
  return (
    <Badge tone="neutral" title="Posted anonymously — citizens never see this name.">
      <EyeOff className="size-2.5" aria-hidden />
      anon
    </Badge>
  );
}
