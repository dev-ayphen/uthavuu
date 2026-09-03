/**
 * What each gated section says when an ops admin reaches it.
 *
 * WHY THE COPY IS IN ONE FILE AND NOT IN EIGHT COMPONENTS
 * ───────────────────────────────────────────────────────────────────────────
 * These eight sentences are the console's whole voice on the subject of "no".
 * Scattered across eight feature folders, nobody ever reads two of them
 * together — which is how one of them quietly starts sounding like a fault
 * ("Access denied") while the other seven explain a rule. Side by side, drift
 * is obvious on sight.
 *
 * THE SHAPE OF EVERY ONE OF THEM
 * ───────────────────────────────────────────────────────────────────────────
 *   title        names the rule, not the outcome. "Only super admins can X",
 *                never "Access denied" — the operator already knows they were
 *                refused; what they do not know is who CAN.
 *   description  says why the line is drawn where it is, then names the next
 *                step. A refusal with no next step is a dead end, and a dead
 *                end in an internal tool becomes a message to the engineer who
 *                built it.
 *
 * The strings are verbatim from the eight components this replaces. They are
 * copy, not code: change them because the product changed, not to tidy them.
 *
 * Admin chrome is english-only (see the App Profile in CLAUDE.md) — these are
 * plain strings on purpose and must not go through a message catalogue.
 */
export type AccessDeniedCopy = { title: string; description: string };

export const ACCESS_DENIED = {
  admins: {
    title: "Only super admins can manage console access",
    description:
      "Your role covers moderation — reports, comments and community members — but adding, suspending or removing admin accounts is restricted. Ask a super admin if you need this. You can still change your own password.",
  },
  announcements: {
    title: "Only super admins can publish announcements",
    description:
      "Your role covers moderation — reports, comments and accounts — but broadcasting to every citizen in the network is restricted. Ask a super admin if you need this.",
  },
  categories: {
    title: "Only super admins can change categories",
    description:
      "Your role covers moderation — reports, comments and accounts. A category edit changes what every citizen can ask for help with, and how long their next request stays live, so it is restricted. Ask a super admin if you need this.",
  },
  settings: {
    title: "Only super admins can change app settings",
    description:
      "Your role covers moderation — reports, comments and accounts — but these switches change how the app behaves for every citizen at once, so they are restricted. Ask a super admin if you need this.",
  },
  support: {
    title: "Only super admins can work support tickets",
    description:
      "Support threads carry citizens' phone numbers and staff-only internal notes, so the queue is restricted to roles holding platform:manage. Ask a super admin if you need access.",
  },
} as const satisfies Record<string, AccessDeniedCopy>;
