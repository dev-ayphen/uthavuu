"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

/**
 * A citizen-uploaded photo, with an honest fallback when the file isn't there.
 *
 * WHY THIS ISN'T JUST `<Image>`
 * ───────────────────────────────────────────────────────────────────────────
 * Photos live on the API's local disk (ADR 0008 — no bucket exists yet), so a
 * row can carry a perfectly valid URL whose file is gone: the container was
 * rebuilt, the volume was cleared, or the row was seeded pointing at something
 * that never existed. Measured on this database today, 96 of 100 reports point
 * at `uploads/test1.jpg`, which 404s.
 *
 * Left alone, `next/image` renders the browser's broken-image glyph — which
 * tells a moderator nothing, and specifically does not distinguish "this report
 * has no photo" from "the photo is missing". Since the whole point of the
 * photos section is that a moderator judges a report by what was pictured, the
 * difference matters: one is a report to act on, the other is an infrastructure
 * problem to report. `cells.tsx` already makes the same call for avatars.
 *
 * A URL from a host outside `next.config.ts`'s `remotePatterns` throws during
 * render rather than firing `onError`, so it is checked before `<Image>` is
 * ever asked to load it — otherwise moving storage to a real bucket would take
 * every report detail page down until the config caught up.
 */
const ALLOWED_HOSTS = new Set(["localhost"]);

function isRenderable(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function ReportPhoto({
  url,
  sizes,
  className,
}: {
  url: string;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // `useState` initialiser, not a render-time call: `window` doesn't exist on
  // the server, and this component is inside a client tree that still SSRs.
  const [renderable] = useState(() => (typeof window === "undefined" ? true : isRenderable(url)));

  if (failed || !renderable) {
    return (
      <span
        className={cn(
          "flex aspect-[3/2] w-full flex-col items-center justify-center gap-1.5 bg-surface-2 px-2 text-center",
          className,
        )}
      >
        <ImageOff aria-hidden className="size-5 text-fg-faint" />
        <span className="text-[10px] leading-tight font-semibold text-fg-faint">
          Photo unavailable
        </span>
        <span className="max-w-full truncate text-[10px] text-fg-faint" title={url}>
          {url.split("/").pop()}
        </span>
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={640}
      height={427}
      // Without `sizes`, Next requests a full-width source for a thumbnail on
      // every card in the grid.
      sizes={sizes}
      onError={() => setFailed(true)}
      className={cn("aspect-[3/2] w-full object-cover", className)}
    />
  );
}
