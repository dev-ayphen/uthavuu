"use client";

import { ImageOff, Lock, ShieldQuestion } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { API_URL } from "@/lib/env";

/**
 * A QUARANTINED photo, loaded from the admin-only file route.
 *
 * ==========================================================================
 * THIS IS NOT `UploadedPhoto`, AND IT MUST NOT BECOME IT.
 * ==========================================================================
 * `features/moderation/uploaded-photo.tsx` renders PUBLIC citizen uploads: it
 * takes a stored `/uploads/**` URL and re-homes it onto the API origin. A photo
 * held for moderation has no such URL and no `report_photos` row — the bytes
 * sit in the quarantine directory and the only way to see them is
 * `GET /admin/report-photos/:id/file`, which the API answers only for an
 * authenticated admin holding `reports:manage`.
 *
 * Pointing this at `/uploads/` would either 404 (the file is not there) or, far
 * worse, imply that a held photo is already public. Never do it.
 *
 * WHY A PLAIN `<img>` AND NOT `next/image`
 * ───────────────────────────────────────────────────────────────────────────
 * `next/image` proxies through Next's image optimiser, which fetches the URL
 * **server-side, from the Next process, with no cookies**. This route needs the
 * admin's session cookie, so every request would come back 403 and every photo
 * in the queue would render as unavailable. The optimiser would also need this
 * path added to `images.remotePatterns`, which would be declaring a private
 * admin route to be an image host.
 *
 * A plain `<img>` is fetched by the BROWSER, which attaches the session cookie
 * the same way it does for `apiFetch`. That works cross-origin because the
 * console and the API share a registrable domain — `localhost` in development,
 * and a shared parent domain in production, which `lib/server-api.ts` already
 * documents as a deployment requirement for exactly this reason. If that ever
 * stops being true, cookies stop riding along here and on every other request
 * this console makes; this component is not the thing that breaks first.
 *
 * `crossOrigin` is deliberately NOT set. Adding it turns the load into a CORS
 * request whose failure mode is a silent block rather than a fallback, and
 * nothing here needs to read the pixels.
 *
 * WHAT THE FALLBACK SAYS, AND WHY IT HEDGES
 * ───────────────────────────────────────────────────────────────────────────
 * An `<img>` error event carries no status, so the console genuinely cannot
 * tell 403 from 404 from a dead container. It says so, and names the two
 * likeliest causes, rather than picking one and being confidently wrong. The
 * common one is legitimate: quarantined bytes are deleted once a rejection's
 * retention window closes, while the decision row — the thing that matters for
 * an audit — survives the file.
 */

export type PrivatePhotoVariant = "thumb" | "full";

/**
 * The admin-authenticated URL for one quarantined photo.
 *
 * Built off `API_URL` for the same reason `resolveUploadUrl` is: the origin is
 * whatever this console is configured to talk to, never a hardcoded host.
 */
export function privatePhotoUrl(photoId: string): string {
  return new URL(
    `/admin/report-photos/${encodeURIComponent(photoId)}/file`,
    API_URL,
  ).toString();
}

export function PrivatePhoto({
  photoId,
  label = "Held photo",
  variant = "full",
  className,
}: {
  /** `photo_uploads.id`. Null when there is no photo record at all. */
  photoId: string | null;
  /** A noun phrase, used as alt text and inside the fallback. */
  label?: string;
  variant?: PrivatePhotoVariant;
  className?: string;
}) {
  // Keyed by id rather than a bare boolean: React reuses a component instance
  // across rows when the key is stable, and a previous row's failure must not
  // be inherited by the photo that replaced it.
  const [failedId, setFailedId] = useState<string | null>(null);

  const isThumb = variant === "thumb";
  const frame = cn(
    "flex aspect-[3/2] w-full flex-col items-center justify-center gap-1 text-center",
    isThumb ? "px-1" : "gap-1.5 px-3",
    className,
  );

  if (photoId === null) {
    return (
      <span
        className={cn(frame, "border border-dashed border-border")}
        title="No photo is attached to this verification record."
      >
        <ShieldQuestion
          aria-hidden
          className={cn("text-fg-faint", isThumb ? "size-3.5" : "size-5")}
        />
        {isThumb ? null : (
          <span className="text-[10px] leading-tight font-semibold text-fg-faint">No photo</span>
        )}
      </span>
    );
  }

  if (failedId === photoId) {
    return (
      <span
        className={cn(frame, "bg-surface-2")}
        title={`${label} couldn’t be loaded. The quarantined file may have been deleted after a rejection’s retention window closed, or your session may have expired.`}
      >
        <ImageOff aria-hidden className={cn("text-fg-faint", isThumb ? "size-3.5" : "size-5")} />
        {isThumb ? null : (
          <>
            <span className="text-[10px] leading-tight font-semibold text-fg-faint">
              {label} unavailable
            </span>
            <span className="max-w-full text-[10px] leading-tight text-fg-faint">
              The quarantined file may be gone, or your session may have expired.
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    // next/image proxies through the optimiser, which fetches server-side with
    // no cookies; this route is admin-authenticated, so every request would come
    // back 403. See the header for the full reasoning.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={privatePhotoUrl(photoId)}
      alt={label}
      // Twenty-five of these on a queue page; only the visible ones should cost
      // a request against a route that reads bytes off the quarantine disk.
      loading="lazy"
      decoding="async"
      onError={() => setFailedId(photoId)}
      className={cn("aspect-[3/2] w-full bg-surface-2 object-cover", className)}
    />
  );
}

/**
 * The standing note that goes beside a full-size preview.
 *
 * Held photos are not public — that is the whole point of the queue — and a
 * moderator looking at one on a screen in an office should be told so rather
 * than assume they are reviewing something citizens can already see.
 */
export function QuarantineNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[11px] text-fg-faint", className)}>
      <Lock aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        Held in quarantine. No citizen can see this photo, and the report carries no public photo
        record until it is approved.
      </span>
    </p>
  );
}
