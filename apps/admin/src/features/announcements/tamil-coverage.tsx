import { Badge } from "@/components/ui";

import type { AdminUpdate } from "./types";

/**
 * Does this update have Tamil, and what does a Tamil-speaking citizen actually
 * get if it doesn't?
 *
 * THIS IS THE POINT OF THE COLUMN, NOT A DECORATION
 * ───────────────────────────────────────────────────────────────────────────
 * Uthavu is a Tamil Nadu product; the mobile app ships English AND Tamil, and
 * a Tamil-locale citizen reading this update sees `titleTa ?? titleEn`. An
 * operator scanning the list has no other way to tell whether the thing they
 * published reached its audience in the language that audience reads — the
 * title column shows English either way, so a wholly-untranslated update looks
 * identical to a fully translated one.
 *
 * "Partial" is called out on its own because it is the worst of the three and
 * the easiest to ship by accident: a Tamil headline sitting on top of an
 * English body reads as a broken app rather than as a missing translation.
 */

export type TamilCoverage = "full" | "partial" | "none";

export function tamilCoverage(record: Pick<AdminUpdate, "titleTa" | "bodyTa">): TamilCoverage {
  const hasTitle = Boolean(record.titleTa?.trim());
  const hasBody = Boolean(record.bodyTa?.trim());
  if (hasTitle && hasBody) return "full";
  if (hasTitle || hasBody) return "partial";
  return "none";
}

export function TamilCoverageBadge({ coverage }: { coverage: TamilCoverage }) {
  if (coverage === "full") {
    return (
      <Badge tone="success" title="Tamil readers see the Tamil title and body.">
        {/* Tagged so a screen reader switches voice, and so the Tamil face in
            --font-sans is selected explicitly rather than by codepoint luck. */}
        <span lang="ta">தமிழ்</span>
      </Badge>
    );
  }

  if (coverage === "partial") {
    return (
      <Badge
        tone="warning"
        title="Only half of this is translated. Tamil readers get a mix of Tamil and English."
      >
        Partial
      </Badge>
    );
  }

  return (
    <Badge tone="neutral" title="No Tamil. Tamil readers see the English title and body.">
      English only
    </Badge>
  );
}
