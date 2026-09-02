"use client";

import { UploadedPhoto } from "@/features/moderation/uploaded-photo";

/**
 * A photo attached to a report, or to a volunteer's completion proof.
 *
 * All of the behaviour — resolving the stored URL onto the API origin this
 * console talks to, and the "photo unavailable" fallback when the file is gone
 * — lives in `features/moderation/uploaded-photo.tsx`. This file used to carry
 * its own copy of the host check, which had drifted from the one in
 * `features/impact-stories/story-photo.tsx` and hardcoded `localhost`, so the
 * first photo uploaded from a real device would have been rejected
 * (`docs/_audit/issues.md` issue 16). There is now one implementation.
 */
export function ReportPhoto({
  url,
  sizes,
  className,
}: {
  url: string;
  sizes: string;
  className?: string;
}) {
  return <UploadedPhoto url={url} sizes={sizes} className={className} />;
}
