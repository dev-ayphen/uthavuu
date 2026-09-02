import { Badge, type BadgeProps } from "@/components/ui";
import type { ImpactStoryStatus } from "./types";

type Tone = NonNullable<BadgeProps["tone"]>;

/**
 * The completion lifecycle, from `mission_completion_statuses`.
 *
 * RENDER THE LABEL, BRANCH ON THE KEY. The label is the lookup table's, so a
 * status somebody adds in a future seed still displays its real name here
 * instead of falling through to a blank cell or a hardcoded synonym — renaming a
 * status is a data change, not a deploy. Only the COLOUR is decided locally, and
 * an unrecognised key gets a neutral one, which is legible and claims nothing.
 *
 * THESE ARE NOT MODERATION STATES. `submitted` -> `waiting_verification` ->
 * `verified` is the completion's own lifecycle, and today every completion is
 * inserted already `verified` in the same statement that creates it
 * (`missions.service.ts`). There is no review queue behind these words. Whether
 * Impact Stories should have one is open question 12 and is undecided, so
 * `waiting_verification` gets a neutral-warning tint that reads as "in
 * progress", never an amber "action required" that would invent a queue.
 */
const TONE: Record<string, Tone> = {
  verified: "success",
  waiting_verification: "warning",
  submitted: "info",
};

export function StoryStatusBadge({ status }: { status: ImpactStoryStatus }) {
  return (
    <Badge tone={TONE[status.key] ?? "neutral"} title={status.key}>
      {status.label}
    </Badge>
  );
}

/**
 * A volunteer's participation state, from `mission_volunteer_statuses`.
 *
 * Same tones as the Reports detail roster, so one roster cannot look like two
 * different things on two screens.
 */
const VOLUNTEER_TONE: Record<string, Tone> = {
  active: "success",
  joined: "info",
};

export function VolunteerStatusBadge({ status }: { status: ImpactStoryStatus }) {
  return (
    <Badge tone={VOLUNTEER_TONE[status.key] ?? "neutral"} title={status.key}>
      {status.label}
    </Badge>
  );
}
