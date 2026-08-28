import type { Route } from "next";
import {
  BarChart3,
  DollarSign,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The console's 8 sections.
 *
 * This is the single source of truth for the sidebar: order, labels, icons,
 * routes, and which counter feeds each badge. Adding a section means editing
 * this file and adding the route — nothing in the shell needs to change.
 */

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
  badgeKey?: NavBadgeKey;
};

export type NavSection = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Section landing route. Present on every section so the parent is clickable. */
  href: Route;
  badgeKey?: NavBadgeKey;
  children?: NavChild[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    key: "users",
    label: "Users",
    icon: Users,
    href: "/users",
    badgeKey: "users",
  },
  {
    key: "reports",
    label: "Reports",
    icon: Megaphone,
    href: "/reports",
    badgeKey: "reportsOpen",
    children: [
      { label: "All Reports", href: "/reports" },
      // "Flagged Comments", not Reports: `report_comment_flags` is the only flag
      // table in the API and the endpoint is /admin/flagged-comments. Reports
      // cannot be flagged at all, so the old label promised a feature that
      // does not exist and sent moderators looking for a queue with no source.
      { label: "Flagged Comments", href: "/reports/flagged", badgeKey: "commentsFlagged" },
      { label: "Comments", href: "/reports/comments", badgeKey: "commentsFlagged" },
    ],
  },
  {
    key: "community",
    label: "Community",
    icon: Sparkles,
    href: "/community/impact-stories",
    children: [
      {
        label: "Impact Stories",
        href: "/community/impact-stories",
        badgeKey: "impactStoriesPending",
      },
      { label: "Community Updates", href: "/community/updates" },
      { label: "Broadcasts", href: "/community/broadcasts", badgeKey: "broadcastsActive" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: BarChart3,
    href: "/analytics",
  },
  {
    key: "platform",
    label: "Platform",
    icon: Settings,
    href: "/platform/categories",
    children: [
      { label: "Categories", href: "/platform/categories" },
      { label: "App Settings", href: "/platform/settings" },
      { label: "Support", href: "/platform/support", badgeKey: "supportNew" },
      { label: "System Health", href: "/platform/system-health" },
      { label: "Audit Logs", href: "/platform/audit-logs" },
    ],
  },
  {
    key: "monetization",
    label: "Monetization",
    icon: DollarSign,
    href: "/monetization",
    children: [
      { label: "Overview", href: "/monetization" },
      { label: "Google AdMob", href: "/monetization/admob" },
      { label: "Sponsors", href: "/monetization/sponsors" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    icon: ShieldCheck,
    href: "/admins",
    badgeKey: "admins",
  },
];

/**
 * Which section owns a pathname.
 *
 * Longest-prefix wins so `/reports/flagged` resolves to Reports rather than
 * matching `/` or an earlier section. Exact match is required for the root of a
 * section, otherwise `/users` would also light up for `/users-archive`.
 */
export function findActiveSection(pathname: string): NavSection | undefined {
  let best: NavSection | undefined;
  let bestLength = -1;

  for (const section of NAV_SECTIONS) {
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
  section: NavSection,
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
