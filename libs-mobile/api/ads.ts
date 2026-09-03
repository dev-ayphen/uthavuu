// The ONLY place mobile talks to the sponsor-ad endpoints. Nothing else in the
// app may fetch an ad, and nothing in the app may decide whether an ad should
// run — the backend owns eligibility end to end (stored status, start/end
// window, paused, expired). Mobile asks for a placement and renders whatever
// comes back; when an admin pauses a campaign the next fetch simply returns an
// empty list and the ad disappears with no app update and no client-side rule
// to keep in sync.
//
// WHY THIS FILE IS ISOLATED. commit b4c0daf deleted a fabricated "PetCare
// Chennai" sponsor with a fake video modal that the app rendered from a
// hardcoded constant. There is deliberately no constant here, no fallback
// campaign, no sample creative and no dev-mode stub: if the endpoint is
// unreachable, returns nothing, or returns something unrenderable, every path
// in this module resolves to `null`, and `null` means the component renders
// nothing at all. An empty ad container is a bug, not an empty state.
//
// CONTRACT: frozen by the product owner on 2026-09-02 as `GET /sponsors`, the
// shape `apps/api/src/sponsors/` actually serves. Two rival specs circulated
// during the build — `GET /ads` returning a single `{ campaign }`, and
// `GET /sponsor-campaigns` with SCREAMING_CASE placements — and this file was
// briefly written against the latter, which no backend ever served. Both are
// dead; do not resurrect either without a new decision. The admin console
// (`apps/admin/src/features/sponsors/`) is built on this same contract, so the
// two clients now agree with the server and with each other.
//
// IMPRESSION AND CLICK TRACKING DO NOT EXIST, deliberately. The backend argues
// in writing (sponsors.service.ts, sponsors-schema.ts, admin-sponsors.service.ts)
// that counters it cannot verify would be fictional, and the owner confirmed on
// 2026-09-02: no tracking until it is designed as its own feature with its own
// table. This module previously POSTed to two routes that returned 404, which
// failed silently and implied a capability the product does not have — a
// sponsor could have been shown numbers derived from nothing. If tracking is
// ever built, it arrives with a decision record, not as a client change.
//
// SAFETY RULE (do not weaken this). Uthavu is a community *emergency* product.
// Nothing exported here may ever sit in front of accepting help, revealing an
// emergency contact, navigating, completing a mission or filing a report. The
// fetch is additive and fails silently; the two tracking calls return `void`
// specifically so a caller *cannot* await one into a blocking path.
import { apiRequest } from '../lib/api';

/**
 * The placement set is a closed contract between this client and the backend —
 * an ad slot lives in exactly one surface, so "give me any ad" is not a
 * question any screen has.
 *
 * Four keys, and the three that are absent are absent deliberately.
 * `MISSION_COMPLETE` and `APP_OPEN` were dropped on the product owner's rule
 * that monetization stays secondary to the help flow: no ad may appear in, or
 * next to, an active mission, Mission Chat, mission completion, emergency
 * confirmation, or anywhere between "I'll Help" -> the 15-minute confirmation
 * -> "Start Helping". `PROFILE` was dropped in the same pass. Re-adding any of
 * them is a product decision, not a client change. The keys below are the
 * server's `sponsor_placements` lookup values verbatim — renaming one here
 * silently empties a surface in a shipped app.
 */
export const AD_PLACEMENTS = [
  'home',
  'category_list',
  'impact_stories',
  'community_impact',
] as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[number];

/**
 * `video | banner | logo_text` — what kind of creative the card renders.
 *
 * snake_case, matching the backend's `sponsor_creative_types` lookup keys
 * exactly (apps/api/src/db/schema/sponsors-schema.ts), not the prototype's
 * hyphenated `logo-text`.
 */
export const AD_CREATIVE_TYPES = ['video', 'banner', 'logo_text'] as const;

export type AdCreativeType = (typeof AD_CREATIVE_TYPES)[number];

export type SponsorCampaign = {
  id: string;
  sponsorName: string;
  creativeType: AdCreativeType;
  creativeUrl: string | null;
  thumbnailUrl: string | null;
  // Not in the corrected field list, but the backend projection on disk does
  // send it and `logo_text` is meaningless without it. Nullable, so a payload
  // that omits it degrades to a text-only card rather than a broken image.
  logoUrl: string | null;
  headline: string | null;
  body: string | null;
  ctaText: string | null;
  targetUrl: string | null;
};

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Anything unrecognized becomes `logo_text`, which is the no-creative-asset
 * state — a card that shows the name and the copy and nothing else. That is the
 * one creative type that cannot fail to render, so an unknown key from a newer
 * backend degrades to a plain card instead of a blank box.
 */
function creativeType(value: unknown): AdCreativeType {
  return AD_CREATIVE_TYPES.includes(value as AdCreativeType)
    ? (value as AdCreativeType)
    : 'logo_text';
}

/**
 * Field-by-field, and it returns `null` rather than throwing for anything it
 * cannot render.
 *
 * `id` and `sponsorName` are the two fields a card cannot exist without: `id`
 * is what the impression and click calls are keyed on, and `sponsorName` is
 * what makes the "Sponsored" label mean something — an unattributed ad is
 * exactly the thing the labelling rule exists to prevent. Missing either one is
 * not a degraded ad, it is no ad, and no ad is a perfectly normal answer here.
 */
export function normalizeCampaign(raw: unknown): SponsorCampaign | null {
  if (raw === null || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;

  const id = nullableString(c.id);
  const sponsorName = nullableString(c.sponsorName);
  if (!id || !sponsorName) return null;

  return {
    id,
    sponsorName,
    creativeType: creativeType(c.creativeType),
    creativeUrl: nullableString(c.creativeUrl),
    thumbnailUrl: nullableString(c.thumbnailUrl),
    logoUrl: nullableString(c.logoUrl),
    headline: nullableString(c.headline),
    body: nullableString(c.body),
    ctaText: nullableString(c.ctaText),
    targetUrl: nullableString(c.targetUrl),
  };
}

/**
 * One cache entry per placement, and per category when the placement is
 * category-scoped — CATEGORY_LIST asks a different question for "medical help"
 * than for "lost & found", so they must not share a cached answer.
 */
export function adQueryKey(placement: AdPlacement, category?: string) {
  return ['sponsorCampaign', placement, category ?? null] as const;
}

/**
 * `GET /sponsors?placement=…[&category=…]` -> `{ items: [...] }`
 *
 * Returns the first renderable campaign, or `null`.
 *
 * TAKING THE FIRST ITEM IS THE WHOLE ROTATION POLICY, and that is deliberate.
 * The server decides the order; the client does not shuffle, weight or
 * randomize. Picking here would be an unmeasurable product decision made in the
 * wrong layer — and if rotation is ever wanted, the server is the only place
 * that can implement it consistently across sessions and devices.
 *
 * A short list is skipped over rather than failing: if the first item is
 * missing an `id`, the second is tried. An empty list, an absent `items`, a
 * non-array, or a list of entirely unrenderable entries all resolve to `null`.
 *
 * The query string is built by hand rather than with URLSearchParams: React
 * Native ships an incomplete polyfill for it (the RN docs say so outright), and
 * this is two parameters.
 */
export async function getAd(
  placement: AdPlacement,
  category?: string
): Promise<SponsorCampaign | null> {
  let path = `/sponsors?placement=${encodeURIComponent(placement)}`;
  if (category) path += `&category=${encodeURIComponent(category)}`;

  const raw = await apiRequest<unknown>(path, { method: 'GET', auth: true });
  if (raw === null || typeof raw !== 'object') return null;

  const items = (raw as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;

  for (const item of items) {
    const campaign = normalizeCampaign(item);
    if (campaign) return campaign;
  }
  return null;
}
