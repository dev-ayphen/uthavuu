import { ExternalLink, Film, Image as ImageIcon, Type } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui";
import { cn } from "@/lib/cn";

import type { AdminSponsor, SponsorCreativeType } from "./types";

/**
 * A sponsor's creative — what kind it is, and where it lives.
 *
 * ⚠ THIS CONSOLE DOES NOT UPLOAD CREATIVES, AND MUST NOT PRETEND TO
 * ───────────────────────────────────────────────────────────────────────────
 * `docs/webadmin/08-monetization.md` §3.4 #17 and §5 gap #3 record the
 * prototype's worst bug in this section: an "Upload video" button that animated
 * a progress bar 0→100% with **no file picker and no storage**. An operator
 * could finish the wizard convinced a creative had been uploaded when nothing
 * had left their machine. Every field in this feature that takes a creative
 * takes a **URL to something already hosted**, and the form says so in words
 * rather than leaving it to be inferred from the field's type.
 *
 * WHY NOT WIRE THE REAL UPLOAD. `POST /uploads` exists (ADR 0008, local disk)
 * but is the AVATAR endpoint: `avatarUploadOptions` accepts jpeg/png/webp under
 * 5MB, which cannot take a video creative and was never sized for ad artwork.
 * Pointing sponsor creatives at it would put ad assets in the profile-photo
 * bucket on the way to a real provider. So this takes a URL, and says so.
 *
 * WHY THERE IS NO INLINE PREVIEW. `next.config.ts` allowlists exactly one image
 * host — the API's own `/uploads/**` — so `next/image` cannot render a creative
 * hosted anywhere else, and widening that allowlist is a change to a file this
 * work does not own. A link that opens the real asset in a new tab is worth
 * more than a preview that only works for creatives the console could not have
 * hosted anyway.
 */

export type CreativeTypeDef = {
  /** Sent to the API verbatim. */
  key: string;
  label: string;
  /** What `creativeUrl` should point at for this type, in one line. */
  hint: string;
};

/** The three the contract names. The API owns the lookup table; these mirror it. */
export const CREATIVE_TYPES: readonly CreativeTypeDef[] = [
  {
    key: "video",
    label: "Video",
    hint: "A URL to a hosted video file. The app plays it inside the sponsor card.",
  },
  {
    key: "banner",
    label: "Banner",
    hint: "A URL to a hosted banner image.",
  },
  {
    key: "logo_text",
    label: "Logo + text",
    hint: "No creative file — the app composes the card from the logo and description below.",
  },
] as const;

/**
 * What a BRAND-NEW sponsor starts as, and why it is the no-asset type.
 *
 * `logo_text` is the only one of the three that needs no creative URL, and that
 * is exactly why it is the default. The backend schema says a sponsor "can be
 * entered from a phone call with nothing but a name and filled in later" —
 * `name` is its only NOT NULL column. Defaulting to `banner` or `video` would
 * make the pairing rule fire immediately, so the form would refuse to save a
 * name-only sponsor that the API accepts happily. That is the "client stricter
 * than the server" failure: nothing errors on the backend, the operator just
 * concludes the form is broken.
 */
export const DEFAULT_CREATIVE_TYPE = "logo_text";

const TYPE_HINTS = new Map(CREATIVE_TYPES.map((type) => [type.key, type.hint]));

export function creativeTypeHint(key: string): string | undefined {
  return TYPE_HINTS.get(key);
}

/**
 * The options a `<select>` should offer for THIS record.
 *
 * The three known types, plus — when the record carries a type this build has
 * never heard of — that type as well, under the API's own label. Without this
 * an operator opening such a sponsor would see the select fall back to its
 * first option, and pressing Save would silently rewrite the creative type to
 * something the campaign was never set to. A dropdown that quietly changes a
 * field nobody touched is the hardest kind of data loss to trace.
 */
export function creativeTypeOptions(
  current: SponsorCreativeType | null,
): ReadonlyArray<{ key: string; label: string }> {
  const known = CREATIVE_TYPES.map(({ key, label }) => ({ key, label }));
  if (!current || known.some((option) => option.key === current.key)) return known;
  return [...known, { key: current.key, label: current.label || current.key }];
}

/** `logo_text` composes its card from the logo and description — there is no file. */
export function creativeUrlApplies(creativeTypeKey: string): boolean {
  return creativeTypeKey !== "logo_text";
}

const TONE: Record<string, BadgeProps["tone"]> = {
  video: "info",
  banner: "primary",
  logo_text: "neutral",
};

const ICON: Record<string, typeof Film> = {
  video: Film,
  banner: ImageIcon,
  logo_text: Type,
};

/**
 * The creative type, rendered from what the API sent.
 *
 * Same rule as every other lookup badge in this console: only the COLOUR is
 * chosen here, the label comes from the API verbatim, so a type added
 * server-side renders with its real name instead of making the row look broken.
 */
export function CreativeTypeBadge({ type }: { type: SponsorCreativeType }) {
  const Icon = ICON[type.key];
  return (
    <Badge tone={TONE[type.key] ?? "neutral"}>
      {Icon ? <Icon aria-hidden className="size-2.5" /> : null}
      {type.label || type.key}
    </Badge>
  );
}

/**
 * The creative's location — a link out, never an embed.
 *
 * `logo_text` legitimately has no URL, and saying "None" there would read as
 * something missing. The two cases are distinguished rather than collapsed.
 */
export function CreativeLink({
  sponsor,
  className,
}: {
  sponsor: Pick<AdminSponsor, "creativeType" | "creativeUrl">;
  className?: string;
}) {
  if (!creativeUrlApplies(sponsor.creativeType.key)) {
    return (
      <span className={className}>
        <span className="text-fg-faint">Composed from the logo and description</span>
      </span>
    );
  }

  if (!sponsor.creativeUrl) {
    return (
      <span className={className}>
        {/* Not "—". A creative type that needs a file, with no file, is a
            campaign that cannot render — worth naming, not worth alarming. */}
        <span className="text-warning-fg">No creative URL set</span>
      </span>
    );
  }

  return (
    <a
      href={sponsor.creativeUrl}
      target="_blank"
      rel="noreferrer noopener"
      title={sponsor.creativeUrl}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-control text-fg-subtle underline decoration-border underline-offset-2 transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="truncate">{displayUrl(sponsor.creativeUrl)}</span>
      <ExternalLink aria-hidden className="size-3 shrink-0 text-fg-faint" />
    </a>
  );
}

/** Host + path, without the scheme — a full URL in a table cell is all noise. */
export function displayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.host}${path}`;
  } catch {
    // Not parseable as an absolute URL. Show it as typed rather than hiding it —
    // seeing the malformed value is how an operator works out what to fix.
    return raw;
  }
}
