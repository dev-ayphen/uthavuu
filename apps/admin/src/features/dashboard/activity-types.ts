import type { Route } from "next";
import {
  Activity,
  CheckCircle2,
  HandHeart,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import type { Accent } from "@/components/ui";
import { reportDetailHref, userDetailHref } from "@/features/moderation/routes";

/**
 * The activity feed's half of the contract: `GET /admin/activity`.
 *
 *   { items: ActivityItem[], nextCursor?: string }
 *
 * Everything here is parsing and presentation. Nothing invents a row: an entry
 * the API did not send does not appear, and an entry it sent that this build
 * does not recognise appears with the API's own words rather than a guess.
 */

export const ACTIVITY_TYPES = [
  "report.created",
  "mission.accepted",
  "mission.completed",
  "comment.posted",
  "user.joined",
  "admin.action",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * `id` is nullable while `name` is not, and that is not sloppiness in the API:
 * an `admin.action` snapshots the actor's name at write time and nulls
 * `actor_user_id` when the account is deleted, so a departed admin's entries
 * stay readable. "Is there a name to show" is the question — never "is there an
 * id" — and an actor with no id simply cannot be linked to a profile.
 */
export type ActivityActor = { id: string | null; name: string };

export type ActivityItem = {
  id: string;
  /**
   * Widened to `string` on purpose. The six known values are in `ACTIVITY_TYPES`,
   * but the API is free to add a seventh before this console redeploys, and a
   * union here would make that row a type lie rather than a rendering decision.
   * `describeActivity` handles the unknown case explicitly.
   */
  type: string;
  /** ISO, newest first. Null only if the API sent something unparseable. */
  occurredAt: string | null;
  actor: ActivityActor | null;
  /** The account is gone; the thing it did is not. Never render this as blank. */
  actorDeleted: boolean;
  /**
   * The reporter chose to post anonymously, so the API withheld the name — the
   * account still exists.
   *
   * DISTINCT FROM `actorDeleted`, and it has to stay that way: data.md
   * invariant 3 says "Deleted User" and "Posted anonymously" are different
   * facts and must never be conflated in any UI, admin included. One is a
   * person who left; the other is a person who is still here and asked not to
   * be named. Collapsing them into one grey placeholder tells the operator the
   * wrong thing about a live account.
   */
  actorAnonymous: boolean;
  targetLabel: string | null;
  targetType: string | null;
  targetId: string | null;
  /**
   * Only ever populated for `admin.action`: the audit action's key and label
   * ("report.hide" / "Hide report"). Without it every moderation row reads "an
   * admin did something", which is noise rather than activity.
   */
  detail: { key: string; label: string } | null;
};

export type ActivityPage = {
  items: ActivityItem[];
  /** Absent on the last page. Opaque — echoed straight back as `?cursor=`. */
  nextCursor: string | null;
  /**
   * Whether `admin.action` rows are in this stream at all.
   *
   * A permission fact, not a data one: reading the audit trail is super-admin
   * only, so an ops admin gets a legitimately shorter feed. The API returns
   * this rather than letting the console imply it, and the console has to SAY
   * it — an unexplained short feed is indistinguishable from a broken one.
   */
  includesAdminActions: boolean;
};

export type ActivityPresentation = {
  /** Reads after the actor's name: "Priya Raman **raised a help request**". */
  verb: string;
  /**
   * Reads with no subject, for the rows where the API sends no actor at all.
   * "No actor recorded raised a help request" is not a sentence; "Help request
   * raised" is, and it makes the same claim without inventing a person.
   */
  impersonal: string;
  icon: LucideIcon;
  accent: Accent;
};

const PRESENTATION: Record<ActivityType, ActivityPresentation> = {
  "report.created": {
    verb: "raised a help request",
    impersonal: "Help request raised",
    icon: Megaphone,
    accent: "amber",
  },
  "mission.accepted": {
    verb: "accepted a mission",
    impersonal: "Mission accepted",
    icon: HandHeart,
    accent: "violet",
  },
  "mission.completed": {
    verb: "completed a mission",
    impersonal: "Mission completed",
    icon: CheckCircle2,
    accent: "emerald",
  },
  "comment.posted": {
    verb: "posted a community update",
    impersonal: "Community update posted",
    icon: MessageSquare,
    accent: "pink",
  },
  "user.joined": {
    verb: "joined Uthavu",
    impersonal: "New sign-up",
    icon: UserPlus,
    accent: "blue",
  },
  "admin.action": {
    verb: "took an admin action",
    impersonal: "Admin action recorded",
    icon: ShieldCheck,
    accent: "slate",
  },
};

export type ActivityDescription = ActivityPresentation & { known: boolean };

/**
 * How to say what happened.
 *
 * An unrecognised type renders the API's raw key — "shipment.created" — instead
 * of a sentence. That is deliberate on both counts: inventing prose for an event
 * this build has never seen would be a claim nobody checked, and dropping the
 * row would hide activity from the person whose job is to watch it. The raw key
 * is ugly, honest, and tells whoever sees it that the console needs an update.
 */
export function describeActivity(type: string): ActivityDescription {
  const known = PRESENTATION[type as ActivityType];
  if (known) return { ...known, known: true };
  return { verb: type, impersonal: type, icon: Activity, accent: "slate", known: false };
}

/**
 * Where a row goes when clicked, or null when there is nowhere honest to send
 * the operator.
 *
 * A link to a page that cannot show the thing is worse than no link: a comment
 * id fed to a list that filters by REPORT matches nothing, and "no results"
 * reads as "the comment was deleted". So unmapped targets get no link, and the
 * row still renders everything it knows.
 */
export function activityHref(item: ActivityItem): Route | null {
  // An admin action's own record lives in the audit log, not on the thing it
  // touched. Someone clicking "took an admin action" wants the entry saying
  // WHAT was done, by whom, and to what — which is the audit list, filtered.
  if (item.type === "admin.action") {
    if (item.targetId) {
      return `/platform/audit-logs?targetId=${encodeURIComponent(item.targetId)}`;
    }
    if (item.actor?.id) {
      return `/platform/audit-logs?actorUserId=${encodeURIComponent(item.actor.id)}`;
    }
    return "/platform/audit-logs";
  }

  if (!item.targetId) return null;

  switch (item.targetType) {
    case "report":
      return reportDetailHref(item.targetId);
    case "user":
      return userDetailHref(item.targetId);
    default:
      // Includes `comment` and `mission`: neither has a detail page in this
      // console, and neither list can be filtered by its own id.
      return null;
  }
}

/**
 * The React key for a row.
 *
 * `id` is the SOURCE ROW's id, and the stream is a union over six tables — the
 * API's own contract says to pair it with `type`. A bare `id` risks two rows
 * from different tables colliding, which React resolves by reusing the wrong
 * DOM node.
 */
export function activityKey(item: ActivityItem): string {
  return `${item.type}:${item.id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parses one page of the feed.
 *
 * Tolerant about SHAPE, never about CONTENT. A malformed entry is dropped
 * rather than patched up with defaults — a row keyed on a missing id would
 * collide with its neighbours in React's reconciliation, and an entry with no
 * `type` has no sentence to render, so there is nothing truthful to show. What
 * survives is exactly what the API said.
 */
export function readActivityPage(raw: unknown): ActivityPage {
  const body = isRecord(raw) ? raw : {};
  const items = Array.isArray(body.items) ? body.items : [];

  return {
    items: items
      .map(readActivityItem)
      .filter((item): item is ActivityItem => item !== null),
    nextCursor: readString(body.nextCursor),
    // Defaults to true only when the API says so. Assuming true on an older
    // build would have the console promise a completeness it cannot check.
    includesAdminActions: body.includesAdminActions !== false,
  };
}

function readActivityItem(raw: unknown): ActivityItem | null {
  if (!isRecord(raw)) return null;

  const id = readString(raw.id);
  const type = readString(raw.type);
  if (!id || !type) return null;

  const actor = isRecord(raw.actor) ? raw.actor : null;
  // Keyed on the NAME, exactly as the API is: an admin.action carries a
  // snapshotted name with a null id, and requiring an id here would throw that
  // name away and render "no actor recorded" about someone we can plainly name.
  const actorName = actor ? readString(actor.name) : null;

  const detail = isRecord(raw.detail) ? raw.detail : null;
  const detailKey = detail ? readString(detail.key) : null;
  const detailLabel = detail ? readString(detail.label) : null;

  return {
    id,
    type,
    occurredAt: readString(raw.occurredAt),
    actor: actorName ? { id: actor ? readString(actor.id) : null, name: actorName } : null,
    actorDeleted: raw.actorDeleted === true,
    actorAnonymous: raw.actorAnonymous === true,
    targetLabel: readString(raw.targetLabel),
    targetType: readString(raw.targetType),
    targetId: readString(raw.targetId),
    detail: detailKey && detailLabel ? { key: detailKey, label: detailLabel } : null,
  };
}
