/**
 * Shapes returned by the sponsors endpoints.
 *
 * Transcribed from the FROZEN contract agreed with the backend agent building
 * this module in parallel — not from running code. As of writing the API
 * answers 404 for every path below (`GET /admin/sponsors` -> "Cannot GET"),
 * which the console renders honestly through `classifyListFailure`'s 404 branch
 * ("That list doesn't exist yet"). Nothing in this feature fabricates a sponsor
 * to fill the gap.
 *
 *   GET    /admin/sponsors?page&limit&status&q
 *   GET    /admin/sponsors/:id
 *   POST   /admin/sponsors
 *   PATCH  /admin/sponsors/:id
 *   POST   /admin/sponsors/:id/pause
 *   POST   /admin/sponsors/:id/activate
 *   DELETE /admin/sponsors/:id                 -> 204 (SOFT delete)
 *
 * Every one of them requires `platform:manage`. Read and write share the single
 * permission, so there is no "can look but not touch" state to render — the
 * section is gated whole, server-side, in `permission.ts`.
 *
 * WHAT IS NOT HERE, AND MUST NOT BE ADDED
 * ───────────────────────────────────────────────────────────────────────────
 * `views`, `clicks`, CTR, eCPM, revenue. The prototype carried them
 * (`MOCK_SPONSORS` seeded SP001 with 12,840 views / 342 clicks) and
 * `docs/webadmin/08-monetization.md` §4.1 records why they were fiction twice
 * over: the mobile app reports no impressions, and the AdMob units were
 * Google's public test IDs, which earn nothing even when they serve. The API
 * does not return these fields, so the type does not carry them and no
 * component in this feature renders a delivery or revenue figure. If impression
 * reporting is ever built, it arrives as a contract change first.
 */

/**
 * Deliberately `{ key, label }` with a `string` key, matching `AdminRoleRef` in
 * `src/lib/roles.ts`: the API authors the display text and owns the status
 * lookup table, so a status added server-side must render with its real name
 * rather than making the row look broken until this console is redeployed.
 */
export type SponsorStatus = { key: string; label: string };

/** Same rule as `SponsorStatus` — the API owns the creative-type lookup table. */
export type SponsorCreativeType = { key: string; label: string };

export type AdminSponsor = {
  id: string;
  /** The organisation. Required by the API — the only field that always exists. */
  name: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  category: string | null;
  /** The campaign this creative belongs to. A sponsor may run several over time. */
  campaignName: string | null;
  location: string | null;
  creativeType: SponsorCreativeType;
  /** A URL to an ALREADY-HOSTED creative. This console never uploads one — see `creative.tsx`. */
  creativeUrl: string | null;
  /** Placement KEYS, exactly as the mobile app spells them. See `./placements.ts`. */
  placements: string[];
  startDate: string | null;
  endDate: string | null;
  status: SponsorStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * The body `POST /admin/sponsors` and `PATCH …/:id` accept.
 *
 * TWO FIELDS ARE SENT AS A BARE KEY, NOT AS THE `{ key, label }` THE READ
 * SIDE RETURNS. `creativeType` is a lookup value the API owns (CLAUDE.md:
 * "status / enum values live in lookup tables referenced by FK"), so the client
 * sends the identifier and the API resolves the label. `status` is NOT in this
 * payload at all: the contract moves a sponsor between states through
 * `/pause` and `/activate`, and a second way to set the same field is a second
 * set of rules to keep in sync.
 */
export type SponsorPayload = {
  name: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  category: string | null;
  campaignName: string | null;
  location: string | null;
  creativeType: string;
  creativeUrl: string | null;
  placements: string[];
  startDate: string | null;
  endDate: string | null;
};
