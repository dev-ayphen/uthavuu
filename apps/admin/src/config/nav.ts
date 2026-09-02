import type { Route } from "next";
import {
  BarChart3,
  DollarSign,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The console's 9 sections.
 *
 * This is the single source of truth for the sidebar: order, labels, icons,
 * routes, which counter feeds each badge, and — since this file was corrected —
 * WHICH PERMISSION EACH DESTINATION NEEDS. Adding a section means editing this
 * file and adding the route; nothing in the shell needs to change.
 *
 * GATING IS UX, NOT SECURITY. READ THIS BEFORE REMOVING A SERVER GUARD.
 * ───────────────────────────────────────────────────────────────────────────
 * Every `permission` below MIRRORS a `@RequireAdminPermissions(...)` that the
 * API already enforces on the endpoints behind that route. The server is the
 * enforcement point and must stay so: this file only decides whether to DRAW a
 * door that is already locked. Nothing here stops anyone reaching a route — the
 * URL still works, the page still renders, and the API still returns 403.
 *
 *   >> Do NOT delete or weaken any `@RequireAdminPermissions` on the strength
 *   >> of this file. Hiding a link is not a check. An operator who types the
 *   >> path, follows a bookmark, or edits the address bar bypasses every line
 *   >> of this module and hits the server guard — which is exactly where the
 *   >> decision belongs, and the only place it is actually made.
 *
 * WHY HIDE AT ALL. The previous version of this comment argued that showing
 * every section to everyone helped an operator "tell a missing feature from one
 * they lack the role for". In practice it did the opposite: an ops admin saw
 * Analytics, Announcements, Platform, Monetization and Admin, clicked each one,
 * and was refused five times. Five dead links reads as a broken console, not as
 * a boundary working correctly. Rejected by the product owner.
 *
 * THE RULES
 * ───────────────────────────────────────────────────────────────────────────
 *  1. Every destination declares its permission EXPLICITLY, and the field is
 *     required — a new entry cannot be added without deciding. `null` is the
 *     only way to say "no gate", and it is a decision, not a default.
 *  2. It fails CLOSED, matching `isSuperAdmin()` in `lib/roles.ts`. An
 *     unrecognised permission string, a session carrying none, and an absent
 *     session all resolve to NOT VISIBLE — never to visible-by-default.
 *  3. Sections are gated by their CHILDREN, one child at a time. A section
 *     appears when at least one child is usable and shows only the usable
 *     ones; when none are, the whole section disappears rather than rendering
 *     a heading with nothing under it.
 *  4. The permission list comes from the SESSION (`GET /admin/me`, via
 *     `lib/session.ts`), which is the DB's answer at request time. The role key
 *     is never consulted, and there is no role -> section map anywhere: per
 *     `apps/api/src/admin/admin-rbac.ts:5-8` the database is the runtime
 *     authority, so regranting a permission row must light the section up
 *     without a redeploy.
 */

/**
 * The six permissions, mirrored from `ADMIN_PERMISSIONS` in
 * `apps/api/src/admin/admin-rbac.ts`.
 *
 * Spelled out as a union rather than typed `string` so a typo is a build error.
 * That matters more than usual here: a misspelt permission can never be held by
 * anyone, so the fail-closed rule would silently hide the entry from EVERY
 * admin — a bug that looks exactly like a deliberate gate.
 *
 * Duplicating the list is the deliberate trade. The console cannot import from
 * `apps/api`, and the alternative — `string` — trades a compile error for a
 * section nobody can see.
 */
export type AdminPermission =
  | "users:manage"
  | "reports:manage"
  | "comments:manage"
  | "analytics:view"
  | "platform:manage"
  | "data:delete_all";

/**
 * What a destination demands of the signed-in admin.
 *
 * `null` means the API enforces NO permission on it — every authenticated admin
 * may use it. It is not "unknown" and not "not looked up yet": both of those
 * must be resolved before the entry is added, because an unknown permission
 * fails closed and the entry would vanish for everyone.
 */
export type NavPermission = AdminPermission | null;

/** Keys a badge can be driven by. Resolved at render time — see nav-badges.ts. */
export type NavBadgeKey =
  | "users"
  | "reportsOpen"
  | "reportsFlagged"
  | "commentsFlagged"
  | "impactStoriesPending"
  | "broadcastsActive"
  | "supportNew"
  | "admins";

export type NavChild = {
  label: string;
  href: Route;
  /**
   * The permission the API enforces on this destination — NOT the parent's.
   * Children of one section can and do differ; see Community, whose two
   * children sit behind different gates.
   */
  permission: NavPermission;
  badgeKey?: NavBadgeKey;
};

type NavSectionCommon = {
  key: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: NavBadgeKey;
};

/** A section that is itself a page: it owns an href and a permission. */
export type NavLeafSection = NavSectionCommon & {
  href: Route;
  permission: NavPermission;
  children?: never;
};

/**
 * A section that is only a container.
 *
 * It deliberately has NO href and NO permission of its own. Both are DERIVED
 * from the children that survive gating, so there is exactly one place a
 * destination's permission is written down. A declared landing route would be a
 * second source of truth and could point at a page the operator cannot open —
 * which is precisely the bug this file exists to fix.
 */
export type NavGroupSection = NavSectionCommon & {
  children: NavChild[];
  href?: never;
  permission?: never;
};

export type NavSection = NavLeafSection | NavGroupSection;

/**
 * A section as the sidebar receives it: already gated, always with a usable
 * href, and with `children` containing only the entries this admin may open.
 * Flat on purpose — the renderer does no permission work and no narrowing.
 */
export type VisibleNavSection = NavSectionCommon & {
  href: Route;
  children?: NavChild[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    // Open to every admin, and the only `null` that is not a placeholder.
    // `GET /admin/dashboard` (AdminController) and `GET /admin/activity`
    // (AdminActivityController) both carry NO @RequireAdminPermissions — the
    // latter says why in as many words: both roles land on the Dashboard, so
    // both see it. Never hide this one.
    permission: null,
  },
  {
    key: "users",
    label: "Users",
    icon: Users,
    href: "/users",
    // AdminUsersController — `users:manage`, per route, on all four (list,
    // detail, suspend, reactivate).
    permission: "users:manage",
    badgeKey: "users",
  },
  {
    key: "reports",
    label: "Reports",
    icon: Megaphone,
    badgeKey: "reportsOpen",
    // THE TWO GATES IN THIS SECTION ARE NOT THE SAME ONE. Reports are moderated
    // under `reports:manage` and comments under `comments:manage`; both seeded
    // roles hold both today, but they are separate rows in
    // `admin_role_permissions` and revoking one must not take the other with
    // it. An admin holding only `comments:manage` gets this section with its
    // two comment queues and no "All Reports" — which is why the section has no
    // hardcoded landing route.
    children: [
      // AdminReportsController — `reports:manage`.
      { label: "All Reports", href: "/reports", permission: "reports:manage" },
      // "Flagged Comments", not Reports: `report_comment_flags` is the only flag
      // table in the API and the endpoint is /admin/flagged-comments. Reports
      // cannot be flagged at all, so the old label promised a feature that
      // does not exist and sent moderators looking for a queue with no source.
      //
      // AdminCommentsController — `comments:manage` (GET flagged-comments).
      {
        label: "Flagged Comments",
        href: "/reports/flagged",
        permission: "comments:manage",
        badgeKey: "commentsFlagged",
      },
      // AdminCommentsController — `comments:manage` (GET comments).
      {
        label: "Comments",
        href: "/reports/comments",
        permission: "comments:manage",
        badgeKey: "commentsFlagged",
      },
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: Sparkles,
    children: [
      // AdminImpactStoriesController — `reports:manage` on both routes. NOT
      // `comments:manage`: an impact story is the public record of a report, so
      // it is gated with reports even though it lives under Community.
      {
        label: "Impact Stories",
        href: "/community/impact-stories",
        permission: "reports:manage",
        badgeKey: "impactStoriesPending",
      },
      // THERE IS DELIBERATELY NO "COMMUNITY UPDATES" ENTRY HERE.
      //
      // WHERE IT WENT. "Community Updates" is the PUBLIC, per-report
      // information feed — anyone may post to it and everyone can read it.
      // This console already ships exactly that under the feed's other name,
      // Community Comments (`report_comments`), and already moderates it at
      // **Reports → Comments (`/reports/comments`)**. Two names, one feed.
      // The feature is not missing; it is one group up.
      //
      // WHY NOT A SECOND ENTRY POINTING THERE. It would be one page with two
      // homes, and only one of them can ever be lit: `findActiveSection` takes
      // the FIRST section matching at a given href length, and Reports is
      // declared above Community — so on `/reports/comments` the highlight
      // lands on Reports and this entry would sit permanently dark, including
      // at the moment you clicked it. A menu item that never lights up on its
      // own destination reads as broken, which is a worse lie than an absence.
      //
      // AND NOT A REDIRECT. A `/community/updates` route existing only to bounce
      // to `/reports/comments` would manufacture exactly the fake relationship
      // this correction exists to remove. Ruled out by the product owner.
      //
      // NOT TO BE CONFUSED WITH: Announcements (its own section, below) —
      // admin-authored posts broadcast TO citizens. That is the opposite
      // direction of travel, and conflating the two is the bug this fixes.
      //
      // `permission: null` HERE IS A MEASUREMENT, NOT A GUESS — AND IT IS
      // TEMPORARY. `/community/broadcasts` renders `SectionPlaceholder` and
      // fetches nothing; there is no broadcasts controller in `apps/api` and no
      // endpoint to read a gate off. So the honest answer to "what does this
      // destination require" is: nothing. Every admin opens it and sees the
      // same "lands with the notifications module" placeholder — no 403, so no
      // dead link to hide.
      //
      //   >> WHEN THE NOTIFICATIONS MODULE LANDS, COME BACK HERE. Sending a
      //   >> push to every citizen is the Announcements direction of travel and
      //   >> will almost certainly ship behind `platform:manage`. Copy whatever
      //   >> its controller actually declares — do not assume this `null`.
      {
        label: "Broadcasts",
        href: "/community/broadcasts",
        // OWNER DECISION 2026-09-02: `platform:manage`, not `null`.
        //
        // Code-derived, this is genuinely ungated — no broadcasts controller
        // exists and the page fetches nothing, so it refuses nobody. But the
        // owner's rule is "if it isn't needed, don't show it in an ops login",
        // and a coming-soon placeholder is not something an ops moderator
        // needs. Gating it also matches where it is certainly heading: sending
        // a push to every citizen is the Announcements direction of travel, and
        // Announcements is `platform:manage`.
        //
        // Consequence: ops_admin's Community shows Impact Stories alone.
        // When the notifications module lands, replace this with whatever its
        // controller actually declares — do not assume this stays correct.
        permission: "platform:manage",
        badgeKey: "broadcastsActive",
      },
    ],
  },
  // Its OWN section, not a child of Community — that separation is the whole
  // point. Community is citizen content the console moderates; Announcements is
  // console content citizens read: admin-authored, bilingual posts broadcast to
  // every citizen in the network.
  //
  // AdminCommunityUpdatesController declares `platform:manage` at CLASS level,
  // so list, create, update, publish, archive and delete are all covered by
  // construction. Mirrored server-side for the page itself in
  // `features/announcements/permission.ts`; this entry is the sidebar's half of
  // the same mirror.
  //
  // The HTTP path behind it is still `/admin/community-updates` and the table is
  // still `community_updates`; known naming debt, explained in
  // `features/announcements/api.ts`. Do not "fix" it here.
  {
    key: "announcements",
    label: "Announcements",
    icon: Newspaper,
    href: "/announcements",
    permission: "platform:manage",
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: BarChart3,
    href: "/analytics",
    // AdminAnalyticsController, `GET analytics` — `analytics:view`. The ONLY
    // destination in the console behind this permission, and the reason it
    // cannot be folded into `platform:manage`: the same controller's other
    // route is gated differently (see Platform → System Health).
    permission: "analytics:view",
  },
  {
    key: "platform",
    label: "Platform",
    icon: Settings,
    // All five children happen to share `platform:manage` — but that is a
    // finding, not an assumption, and System Health is why it had to be
    // checked one at a time: it lives in AdminAnalyticsController next to
    // `analytics:view`, and reads as an analytics page, yet is gated on
    // `platform:manage`. Assuming a section's children share a gate would have
    // got that one wrong in both directions.
    children: [
      // AdminCategoriesController — `platform:manage`, declared at class level.
      // The controller states the reasoning: editing a category changes live
      // mobile behaviour for every citizen, so it is a platform decision rather
      // than a moderation one.
      { label: "Categories", href: "/platform/categories", permission: "platform:manage" },
      // AdminSettingsController — `platform:manage`, class level (GET + PATCH).
      { label: "App Settings", href: "/platform/settings", permission: "platform:manage" },
      // AdminSupportController — `platform:manage`, class level.
      {
        label: "Support",
        href: "/platform/support",
        permission: "platform:manage",
        badgeKey: "supportNew",
      },
      // AdminAnalyticsController, `GET system-health` — `platform:manage`,
      // NOT the `analytics:view` on the route directly above it in that file.
      {
        label: "System Health",
        href: "/platform/system-health",
        permission: "platform:manage",
      },
      // AdminAuditController — `platform:manage` on both routes.
      { label: "Audit Logs", href: "/platform/audit-logs", permission: "platform:manage" },
    ],
  },
  {
    key: "monetization",
    label: "Monetization",
    icon: DollarSign,
    children: [
      // AdminSponsorsController — `platform:manage`, declared at class level,
      // covering every route the Overview reads.
      { label: "Overview", href: "/monetization", permission: "platform:manage" },
      // Fetches nothing — but unlike Broadcasts it is NOT ungated: the page
      // itself awaits `canViewMonetization()` and renders access-denied without
      // `platform:manage`. The gate is real, so the entry is gated to match.
      { label: "Google AdMob", href: "/monetization/admob", permission: "platform:manage" },
      { label: "Sponsors", href: "/monetization/sponsors", permission: "platform:manage" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    icon: ShieldCheck,
    href: "/admins",
    // `GET /admin/admins` (AdminController) and every route in
    // AdminAccountsController — `platform:manage`, per route.
    permission: "platform:manage",
    badgeKey: "admins",
  },
];

/**
 * The nav this admin may actually use.
 *
 * UX only — see the file header. Order is preserved, and a section is dropped
 * entirely rather than rendered as an empty heading.
 *
 * A group's href is the FIRST SURVIVING CHILD, not a declared landing route.
 * That is what keeps the collapsed rail honest: it links the section straight
 * to a page, and for an admin holding only `comments:manage` that is
 * `/reports/flagged` rather than the `/reports` they would be refused.
 *
 * Pass the session's `permissions` verbatim. Anything falsy is treated as an
 * empty grant, so a caller that has not resolved a session yet gets the
 * Dashboard and nothing else instead of the whole console.
 */
export function visibleNavSections(
  permissions: readonly string[] | null | undefined,
): VisibleNavSection[] {
  const granted = new Set(permissions ?? []);
  const visible: VisibleNavSection[] = [];

  for (const section of NAV_SECTIONS) {
    const { key, label, icon, badgeKey } = section;

    if (section.children) {
      const children = section.children.filter((child) => isPermitted(child.permission, granted));
      // Rule 3: no empty shells. A heading with nothing under it is a worse
      // signal than an absence — it looks like the page failed to load.
      //
      // The landing route is read off the first survivor rather than indexed
      // blindly: under `noUncheckedIndexedAccess` that read IS the emptiness
      // check, so the two can never disagree.
      const [landing] = children;
      if (!landing) continue;
      visible.push({ key, label, icon, badgeKey, href: landing.href, children });
      continue;
    }

    if (!isPermitted(section.permission, granted)) continue;
    visible.push({ key, label, icon, badgeKey, href: section.href });
  }

  return visible;
}

/**
 * The one permission test in the console's navigation.
 *
 * Fails CLOSED by construction: the only route to `true` is an explicit `null`
 * or a string the session actually carries. A permission this build has never
 * heard of, a misspelt one, and an empty grant all fall through to `false`.
 */
function isPermitted(permission: NavPermission, granted: ReadonlySet<string>): boolean {
  if (permission === null) return true;
  return granted.has(permission);
}

/**
 * Badge keys that a rendered entry could actually display.
 *
 * A badge is a call to action: "8" beside Support means eight tickets are
 * waiting for YOU. Counting work behind a door this operator cannot open is
 * noise at best and a false alarm at worst, so a hidden entry's badge is
 * dropped at the source rather than merely going unrendered.
 *
 * Derived from the gated list, so it cannot drift from what is on screen.
 *
 * ONE RULE THIS RELIES ON: a section-level badge must count something reachable
 * from that section's OWN gate. Hanging a child-scoped counter on a parent
 * would sneak past this, because a visible parent keeps its badge even when the
 * child that produces the number is filtered out. Put the badge on the child.
 */
export function visibleBadgeKeys(
  sections: readonly VisibleNavSection[],
): ReadonlySet<NavBadgeKey> {
  const keys = new Set<NavBadgeKey>();
  for (const section of sections) {
    if (section.badgeKey) keys.add(section.badgeKey);
    for (const child of section.children ?? []) {
      if (child.badgeKey) keys.add(child.badgeKey);
    }
  }
  return keys;
}

/**
 * Which section owns a pathname.
 *
 * Longest-prefix wins so `/reports/flagged` resolves to Reports rather than
 * matching `/` or an earlier section. Exact match is required for the root of a
 * section, otherwise `/users` would also light up for `/users-archive`.
 *
 * Takes the GATED list, so a route the operator cannot use highlights nothing —
 * correct, since that section is not on screen to highlight.
 */
export function findActiveSection(
  sections: readonly VisibleNavSection[],
  pathname: string,
): VisibleNavSection | undefined {
  let best: VisibleNavSection | undefined;
  let bestLength = -1;

  for (const section of sections) {
    const candidates = [section.href, ...(section.children?.map((c) => c.href) ?? [])];
    for (const href of candidates) {
      if (isRouteActive(pathname, href) && href.length > bestLength) {
        best = section;
        bestLength = href.length;
      }
    }
  }

  return best;
}

/** True when `pathname` is `href` or a descendant of it. */
export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Which child of a section is active.
 *
 * Longest match wins, so on `/reports/flagged` the "Flagged Comments" child
 * lights up and "All Reports" (`/reports`, a prefix of it) does not. Without
 * this, two siblings would highlight at once and the nav would lie about where
 * the user is.
 */
export function findActiveChildHref(
  section: { children?: readonly NavChild[] },
  pathname: string,
): string | undefined {
  let best: string | undefined;
  for (const child of section.children ?? []) {
    if (isRouteActive(pathname, child.href) && child.href.length > (best?.length ?? -1)) {
      best = child.href;
    }
  }
  return best;
}
