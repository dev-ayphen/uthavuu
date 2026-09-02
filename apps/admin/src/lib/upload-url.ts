import { API_URL } from "./env";

/**
 * How the console resolves a citizen-uploaded photo URL.
 *
 * WHY THIS EXISTS
 * ───────────────────────────────────────────────────────────────────────────
 * Photos live on the API's own local disk (ADR 0008 — no bucket exists yet) and
 * the API builds the stored URL from **the `Host` header of the request that
 * uploaded it** (`apps/api/src/uploads/upload-url.ts`). So the same file is
 * recorded as `http://localhost:3001/uploads/x.png` when curl on the host
 * uploads it and `http://192.168.1.5:3001/uploads/x.png` when a real phone on
 * the LAN does. The origin in the database is an accident of who uploaded, not
 * a fact about where the file is — there is exactly one API serving exactly one
 * disk, and `/uploads/<uuid>` is the only stable part.
 *
 * So we keep the path and re-home it onto the API origin **this** console is
 * configured to talk to (`NEXT_PUBLIC_API_URL`). A moderator then sees the
 * photo whoever uploaded it and from wherever, with no code edit — which is the
 * whole point, since the previous version hardcoded `localhost` and would have
 * rejected the first photo ever sent from a real device.
 *
 * Two useful properties fall out of doing it this way:
 *
 *  1. **The `next/image` render throw becomes unreachable.** A `src` outside
 *     `next.config.ts`'s `images.remotePatterns` throws *during render* rather
 *     than firing `onError`, which an `error.tsx` catches as a whole-segment
 *     failure — one bad row would take down the page instead of one cell. Every
 *     string this function returns is, by construction, the configured API
 *     origin plus a `/uploads/` path, i.e. exactly what `next.config.ts` derives
 *     its single remote pattern from. Both read `NEXT_PUBLIC_API_URL`, so they
 *     cannot drift apart the way two hand-maintained allow-lists did.
 *
 *  2. **It is forward-compatible with the API-side fix.** The right long-term
 *     answer is for the API to store a relative path and let each client
 *     resolve it; `new URL(raw, API_URL)` already accepts `/uploads/x.png`, so
 *     that change needs nothing here.
 *
 * It is also strictly safer than a hostname allow-list. A hostile string in the
 * column — a tracking pixel, an intranet probe — either has a non-`/uploads/`
 * path and is rejected outright, or gets re-homed onto our own API, where it
 * 404s. The browser never issues a request to a host we did not configure.
 *
 * WHEN STORAGE MOVES OFF LOCAL DISK, revisit this whole module together with
 * `next.config.ts`'s `images.remotePatterns`: a real bucket serves a different
 * origin under a different path prefix, and re-homing would then be wrong.
 */

/**
 * The path prefix the API serves uploads under
 * (`app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' })` in
 * `apps/api/src/main.ts`). Anything outside it is not one of our photos.
 */
const UPLOADS_PATH_PREFIX = "/uploads/";

/**
 * Turn a stored photo URL into one this console can actually load, or `null` if
 * it is not a citizen upload at all.
 *
 * Accepts absolute URLs (what the API stores today) and root-relative paths
 * (what it should store). Pure string work — no `window`, so it returns the
 * same answer during SSR and after hydration, and callers need no
 * `typeof window` dance.
 */
export function resolveUploadUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, API_URL);
  } catch {
    return null;
  }

  // Rejects `data:`/`javascript:`/`blob:` too: their "pathname" never starts
  // with a slash, let alone `/uploads/`.
  if (!parsed.pathname.startsWith(UPLOADS_PATH_PREFIX)) return null;

  return new URL(parsed.pathname + parsed.search, API_URL).toString();
}

/** The file name, for a fallback tile that has to say *which* photo is missing. */
export function uploadFileName(url: string): string {
  return url.split("?")[0]?.split("/").pop() ?? url;
}
