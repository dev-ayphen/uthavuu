import { describe, expect, it } from "vitest";
import { NAV_SECTIONS, visibleNavSections, visibleBadgeKeys, findActiveSection } from "./nav";

/**
 * The sidebar's permission gating.
 *
 * This is UX, not security — the API enforces every permission independently,
 * and nav.ts says so at length. But it fails CLOSED on purpose, and "fails
 * closed" is exactly the property that rots silently: a bug here shows an
 * operator a door they will be refused at, or hides one they need, and neither
 * produces an error anywhere.
 */
describe("visibleNavSections", () => {
  const ALL = [
    "users:manage",
    "reports:manage",
    "comments:manage",
    "platform:manage",
    "analytics:view",
  ];

  it("gives a super admin every section", () => {
    expect(visibleNavSections(ALL)).toHaveLength(NAV_SECTIONS.length);
  });

  // The three cases that must never resolve to "show everything".
  it.each([
    ["no session", null],
    ["undefined grants", undefined],
    ["an empty grant", []],
  ])("fails closed for %s, leaving only the ungated Dashboard", (_label, grants) => {
    const visible = visibleNavSections(grants as string[] | null | undefined);
    expect(visible.map((s) => s.key)).toEqual(["dashboard"]);
  });

  it("fails closed for a permission this build has never heard of", () => {
    expect(visibleNavSections(["reports:manag", "nonsense:key"]).map((s) => s.key)).toEqual([
      "dashboard",
    ]);
  });

  // Rule 3 in nav.ts: a section is gated by its children, one at a time.
  it("drops a group entirely rather than rendering an empty heading", () => {
    const keys = visibleNavSections(["users:manage"]).map((s) => s.key);
    expect(keys).toContain("users");
    expect(keys).not.toContain("reports");
    expect(keys).not.toContain("community");
    expect(keys).not.toContain("platform");
  });

  // The case the file calls out by name: an admin holding only comments:manage
  // gets Reports WITHOUT "All Reports", and the section must land on a page
  // they can actually open rather than the /reports they would be refused.
  it("lands a group on its first surviving child, not a hardcoded route", () => {
    const reports = visibleNavSections(["comments:manage"]).find((s) => s.key === "reports");
    expect(reports).toBeDefined();
    expect(reports!.children?.map((c) => c.href)).toEqual([
      "/reports/flagged",
      "/reports/comments",
    ]);
    expect(reports!.href).toBe("/reports/flagged");
  });

  // Photo Verification is report moderation, not comment moderation: approving
  // a photo publishes a held report and rejecting one ends a request for help.
  // It must therefore follow `reports:manage` and NOT ride in on the gate that
  // opens the two comment queues.
  it("gates Photo Verification with reports:manage, not comments:manage", () => {
    const withReports = visibleNavSections(["reports:manage"]).find((s) => s.key === "reports");
    expect(withReports!.children?.map((c) => c.href)).toContain("/reports/photo-verification");

    const withComments = visibleNavSections(["comments:manage"]).find((s) => s.key === "reports");
    expect(withComments!.children?.map((c) => c.href)).not.toContain(
      "/reports/photo-verification",
    );
  });

  // A child, deliberately — the queue moderates reports, and a ninth top-level
  // icon for one queue would make the console look bigger than it is.
  it("keeps Photo Verification under Reports rather than adding a section", () => {
    expect(NAV_SECTIONS.map((s) => s.key)).not.toContain("photo-verification");
    expect(visibleNavSections(ALL)).toHaveLength(NAV_SECTIONS.length);
  });

  it("never hides the Dashboard, which is the one deliberate null gate", () => {
    for (const grants of [[], ["users:manage"], ALL]) {
      expect(visibleNavSections(grants).map((s) => s.key)).toContain("dashboard");
    }
  });
});

describe("visibleBadgeKeys", () => {
  // A badge is a call to action. Counting work behind a door this operator
  // cannot open is a false alarm, so hidden entries drop their badge at source.
  it("omits badges belonging to entries this admin cannot see", () => {
    const keys = visibleBadgeKeys(visibleNavSections(["users:manage"]));
    expect(keys.has("users")).toBe(true);
    expect(keys.has("supportNew")).toBe(false);
    expect(keys.has("commentsFlagged")).toBe(false);
  });

  // The photo queue's badge follows its own entry's gate. `nav-badges.ts` uses
  // this set to decide whether to even REQUEST the count, so a leak here would
  // spend a refused round trip on every sidebar render as well as calling an
  // operator to a door they cannot open.
  it("only offers the photo-queue badge to an admin who can open that queue", () => {
    expect(visibleBadgeKeys(visibleNavSections(["reports:manage"])).has("reportPhotosPending")).toBe(
      true,
    );
    for (const grants of [[], ["users:manage"], ["comments:manage"]]) {
      expect(
        visibleBadgeKeys(visibleNavSections(grants)).has("reportPhotosPending"),
        grants.join(","),
      ).toBe(false);
    }
  });
});

describe("findActiveSection", () => {
  const visible = visibleNavSections([
    "users:manage",
    "reports:manage",
    "comments:manage",
    "platform:manage",
    "analytics:view",
  ]);

  // Longest prefix wins, or two siblings light up at once and the nav lies
  // about where you are.
  it("resolves a child route to its own section, not a shorter prefix", () => {
    expect(findActiveSection(visible, "/reports/flagged")?.key).toBe("reports");
    expect(findActiveSection(visible, "/platform/audit-logs")?.key).toBe("platform");
  });

  it("does not match a section on a route that merely starts with its path", () => {
    expect(findActiveSection(visible, "/users-archive")).toBeUndefined();
  });

  it("highlights nothing for a route this admin cannot use", () => {
    expect(findActiveSection(visibleNavSections([]), "/platform/settings")).toBeUndefined();
  });
});
