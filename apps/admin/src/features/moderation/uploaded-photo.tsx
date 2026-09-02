"use client";

import Image from "next/image";
import { ImageOff, ImagePlus } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { resolveUploadUrl, uploadFileName } from "@/lib/upload-url";

/**
 * A citizen-uploaded photo, with two honest fallbacks: one for "there is no
 * photo" and one for "the photo is gone".
 *
 * WHY THIS ISN'T JUST `<Image>`
 * ───────────────────────────────────────────────────────────────────────────
 * Photos live on the API's local disk (ADR 0008 — no bucket exists yet), so a
 * row can carry a perfectly valid URL whose file is gone: the container was
 * rebuilt, the volume was cleared, or the row was seeded pointing at something
 * that never existed. Left alone, `next/image` renders the browser's
 * broken-image glyph, which tells a moderator nothing and specifically does not
 * distinguish "this record has no photo" from "the photo is missing". One is a
 * fact about the report or story; the other is an infrastructure problem to
 * report. On an Impact Story that difference is the entire point of the page —
 * it is a before/after record, so "there was never a before shot" is content.
 *
 * `resolveUploadUrl` (see `@/lib/upload-url`) does the deciding: it re-homes a
 * stored `/uploads/**` path onto the API origin this console is configured for,
 * and returns `null` for anything that is not a citizen upload. Everything it
 * returns matches `next.config.ts`'s `images.remotePatterns` by construction —
 * which matters, because a `src` outside those patterns throws *during render*
 * rather than firing `onError`, and a render throw is the segment's error
 * boundary and the loss of the whole page. A false "unavailable" is one cell.
 *
 * WHY THERE IS ONLY ONE OF THESE
 * ───────────────────────────────────────────────────────────────────────────
 * There used to be two — `features/reports/report-photo.tsx` and
 * `features/impact-stories/story-photo.tsx` — with copied host checks that had
 * already drifted apart (issues.md issue 16). Both are now thin presentational
 * adapters over this component, so the URL rule lives in exactly one place.
 */

export type UploadedPhotoVariant = "thumb" | "full";

export function UploadedPhoto({
  url,
  label = "Photo",
  variant = "full",
  sizes,
  className,
}: {
  /** The URL as stored on the row. `null` means the record has no photo. */
  url: string | null;
  /**
   * A noun phrase naming what this photo is — "Before photo", "Completion
   * proof". Used as the alt text and inside both fallbacks, so it reads as a
   * sentence: "Before photo unavailable", "No before photo".
   */
  label?: string;
  /**
   * `thumb` is a ~72px table cell: no room for prose, so the fallback is an
   * icon with the reason in `title`. `full` is a detail-page photo, where the
   * file name is worth showing because it is what someone would grep the
   * uploads directory for.
   */
  variant?: UploadedPhotoVariant;
  sizes?: string;
  className?: string;
}) {
  // Keyed by src rather than a bare boolean, so a component instance reused for
  // a different row (React keeps the instance when the key is stable) does not
  // inherit the previous row's failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Pure string work, no `window` — identical on the server and after
  // hydration, so there is nothing to reconcile.
  const src = resolveUploadUrl(url);
  const isThumb = variant === "thumb";
  const frame = cn(
    "flex aspect-[3/2] w-full flex-col items-center justify-center text-center",
    isThumb ? "gap-1 px-1" : "gap-1.5 px-2",
    className,
  );

  // "No photo" is a fact about the record, not a failure. Dashed and neutral,
  // deliberately different from the failure state below.
  if (url === null) {
    return (
      <span
        className={cn(frame, "border border-dashed border-border")}
        title={`No ${label.toLowerCase()} on this record`}
      >
        <ImagePlus aria-hidden className={cn("text-fg-faint", isThumb ? "size-3.5" : "size-5")} />
        {isThumb ? null : (
          <span className="text-[10px] leading-tight font-semibold text-fg-faint">
            No {label.toLowerCase()}
          </span>
        )}
      </span>
    );
  }

  if (src === null || failedSrc === src) {
    return (
      <span className={cn(frame, "bg-surface-2")} title={`${label} unavailable — ${url}`}>
        <ImageOff aria-hidden className={cn("text-fg-faint", isThumb ? "size-3.5" : "size-5")} />
        {isThumb ? null : (
          <>
            <span className="text-[10px] leading-tight font-semibold text-fg-faint">
              {label} unavailable
            </span>
            <span className="max-w-full truncate text-[10px] text-fg-faint">
              {uploadFileName(url)}
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={label}
      width={640}
      height={427}
      // Without `sizes`, Next requests a full-width source for every thumbnail
      // in the table — 25 of them per page.
      sizes={sizes ?? (isThumb ? "72px" : "(min-width: 1024px) 40vw, 90vw")}
      onError={() => setFailedSrc(src)}
      className={cn("aspect-[3/2] w-full object-cover", className)}
    />
  );
}
