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

/**
 * The citizen sponsor contract, named EXACTLY as `GET /sponsors` sends it.
 *
 * This type used to carry `sponsorName`, `headline`, `body`, `ctaText` and
 * `thumbnailUrl` — five names no backend has ever sent. The server's projection
 * (apps/api/src/sponsors/sponsors.service.ts) selects `name`, `description` and
 * `website`, so every one of those read `undefined`: the card rendered with no
 * copy and, because the link came from `targetUrl`, `pressable` was false and
 * the card was not tappable at all. A sponsor's website was unreachable from
 * the app — the entire commercial value of the placement — and nothing logged
 * a thing. The names below are checked by the API's own spec, which asserts
 * this exact seven-field shape.
 *
 * THERE IS NO SEPARATE POSTER IMAGE. `creativeUrl` is the one asset column, so
 * a `video` campaign has no still to render (see `creativeUri` in
 * SponsorAd.tsx). Adding one means a migration and an admin field, not a change
 * here.
 */
export type SponsorCampaign = {
  id: string;
  name: string;
  creativeType: AdCreativeType;
  creativeUrl: string | null;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
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
 * `id` and `name` are the two fields a card cannot exist without: `id` keys the
 * cache entry, and `name` is what makes the "Sponsored" label mean something —
 * an unattributed ad is exactly the thing the labelling rule exists to prevent.
 * Missing either one is not a degraded ad, it is no ad, and no ad is a
 * perfectly normal answer here.
 */
export function normalizeCampaign(raw: unknown): SponsorCampaign | null {
  if (raw === null || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;

  const id = nullableString(c.id);
  const name = nullableString(c.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    creativeType: creativeType(c.creativeType),
    creativeUrl: nullableString(c.creativeUrl),
    logoUrl: nullableString(c.logoUrl),
    description: nullableString(c.description),
    website: nullableString(c.website),
  };
}

/**
 * One cache entry per placement. NOT per category — see `getAd` below.
 *
 * This used to append the category, on the belief that `category_list` asks a
 * different question for "medical help" than for "lost & found". The server
 * does not: it filters on placement alone. Keying by category therefore stored
 * N identical answers under N keys and issued N requests for them.
 */
export function adQueryKey(placement: AdPlacement) {
  return ['sponsorCampaign', placement] as const;
}

/**
 * `GET /sponsors?placement=…` -> `{ items: [...] }`
 *
 * Returns the first renderable campaign, or `null`.
 *
 * THERE IS NO CATEGORY TARGETING, so this sends no category. It used to append
 * `&category=…`; the citizen DTO declares `placement` only
 * (apps/api/src/sponsors/dto/list-sponsors.dto.ts), the global validation pipe
 * strips unknown keys, and the parameter was silently discarded — no 400, no
 * filtering, the same campaign on every category screen. `sponsors.category` is
 * free-text campaign metadata beside `campaign_name` and `location`, not a
 * targeting key, and nothing joins it to a report category. Real targeting
 * needs a server-side filter and a decision about what it targets ON; until
 * then, sending the parameter only implies a capability the product lacks.
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
 * this is one parameter.
 */
export async function getAd(
  placement: AdPlacement
): Promise<SponsorCampaign | null> {
  const path = `/sponsors?placement=${encodeURIComponent(placement)}`;

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
