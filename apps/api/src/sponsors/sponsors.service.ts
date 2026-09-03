import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  sponsorCreativeTypes,
  sponsorPlacements,
  sponsorStatuses,
  sponsors,
} from '../db/schema/sponsors-schema';
import type { SponsorPlacementKey } from '../db/schema/sponsors-schema';
import { sponsorIsLiveSql } from './sponsor-status';

/**
 * How many sponsors one surface will ever render.
 *
 * Unpaginated, like every other citizen endpoint in this API (see
 * UpdatesService's note, and admin-pagination.ts for why the split exists). The
 * cap is what makes that safe: a placement holds a handful of paid campaigns,
 * and if somebody sells forty, the app still receives a bounded payload rather
 * than a slow screen.
 */
const PLACEMENT_LIMIT = 20;

/**
 * Monetization -> Sponsors, as the mobile app sees it.
 *
 * Seven fields and nothing else. The campaign window, the stored status, the
 * placement rows, the soft-delete state and every operator-facing field
 * (`category`, `campaignName`, `location`) are absent BY CONSTRUCTION rather
 * than by redaction — the ADR 0009 shape: this is a separate projection, not
 * the admin one with an `if (isAdmin)` in it.
 *
 * THIS ENDPOINT IS WHERE SCHEDULING AND PAUSING BECOME REAL.
 * docs/webadmin/08-monetization.md §4 lists both as prototype failures —
 * "campaigns can't start or expire", "pausing changes nothing" — because the
 * mobile app rendered a hardcoded constant and never asked anything. There is
 * no second gate anywhere: if a paused or unscheduled campaign is not filtered
 * out HERE, it is on a citizen's screen. `sponsorIsLiveSql` is that filter, and
 * sponsor-status.ts is the argument for why it is evaluated at read time rather
 * than swept into a stored status by a cron.
 */
@Injectable()
export class SponsorsService {
  async list(placement: SponsorPlacementKey) {
    const rows = await db
      .select({
        id: sponsors.id,
        name: sponsors.name,
        // `sponsorName` duplicates `name` deliberately, and additively.
        //
        // The mobile client's frozen contract requires `sponsorName` and
        // DISCARDS any row without it (libs-mobile/api/ads.ts: `if (!id ||
        // !sponsorName) return null`). Sending only `name` meant every campaign
        // normalised to null, getAd() returned null, and SponsorAd rendered
        // nothing — permanently, for every placement, with no error logged
        // anywhere. Exactly the silent failure this module exists to avoid.
        //
        // Emitting both satisfies mobile without breaking any existing
        // consumer. Collapse to one name only when both sides can change
        // together; until then removing either field breaks a live client.
        sponsorName: sponsors.name,
        logoUrl: sponsors.logoUrl,
        description: sponsors.description,
        website: sponsors.website,
        creativeType: sponsorCreativeTypes.key,
        creativeUrl: sponsors.creativeUrl,
      })
      .from(sponsors)
      .innerJoin(sponsorStatuses, eq(sponsors.statusId, sponsorStatuses.id))
      .innerJoin(
        sponsorCreativeTypes,
        eq(sponsors.creativeTypeId, sponsorCreativeTypes.id),
      )
      // innerJoin, so a sponsor with no placement row for this surface simply
      // is not in the result. The unique constraint on
      // (sponsor_id, placement_key) is what makes this join safe to write
      // without a distinct: one sponsor can match this placement at most once,
      // so the same card can never be returned twice in one list.
      .innerJoin(
        sponsorPlacements,
        eq(sponsorPlacements.sponsorId, sponsors.id),
      )
      .where(
        and(
          eq(sponsorPlacements.placementKey, placement),
          // Stored status `active`, not soft-deleted, and inside the campaign
          // window — all four conditions, defined once in sponsor-status.ts so
          // the console's "Active" badge and this query cannot disagree.
          sponsorIsLiveSql,
        ),
      )
      // Newest campaign first, with id breaking ties in true write order
      // (uuidv7 is time-ordered). Deliberately NOT a rotation, a weighting or a
      // random(): ad rotation is a product decision nobody has made, and
      // inventing one here would be unmeasurable — the app reports no
      // impressions (§4.1), so there would be no way to tell whether it worked.
      // A stable order is the honest default and is trivially replaceable.
      .orderBy(desc(sponsors.createdAt), desc(sponsors.id))
      .limit(PLACEMENT_LIMIT);

    // An empty list is a normal, expected answer — most placements will have no
    // paid campaign most of the time. The card renders nothing; it must never
    // fall back to a filler sponsor, which is precisely the hardcoded
    // ACTIVE_SPONSORS constant this endpoint exists to delete.
    return { items: rows };
  }
}
