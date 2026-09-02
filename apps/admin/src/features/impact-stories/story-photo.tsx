"use client";

import { UploadedPhoto, type UploadedPhotoVariant } from "@/features/moderation/uploaded-photo";

export type StoryPhotoVariant = UploadedPhotoVariant;

/**
 * An Impact Story's before/after photo.
 *
 * All of the behaviour — resolving the stored URL onto the API origin this
 * console talks to, the "no photo" affordance, and the "photo unavailable"
 * fallback — lives in `features/moderation/uploaded-photo.tsx`, shared with
 * `features/reports/report-photo.tsx`. This file used to carry its own stricter
 * copy of the check; the two are merged (`docs/_audit/issues.md` issue 16), and
 * the strict property is now structural rather than checked: every URL the
 * resolver returns matches `next.config.ts`'s remote pattern by construction.
 *
 * The one thing that stays here is the vocabulary. `alt` is what the photo IS —
 * "Before" / "After" — which the shared component wants as a full noun phrase,
 * so it reads correctly in both fallbacks ("No before photo", "After photo
 * unavailable").
 */
export function StoryPhoto({
  url,
  alt,
  variant = "full",
  sizes,
  className,
}: {
  url: string | null;
  /** What this photo IS — "Before" / "After". Used in both fallbacks. */
  alt: string;
  variant?: StoryPhotoVariant;
  sizes?: string;
  className?: string;
}) {
  return (
    <UploadedPhoto
      url={url}
      label={`${alt} photo`}
      variant={variant}
      sizes={sizes}
      className={className}
    />
  );
}
