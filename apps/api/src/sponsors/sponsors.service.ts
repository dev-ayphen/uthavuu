import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
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
      // RANDOM, and this is the rotation policy.
      //
      // The order used to be newest-first, on the reasoning that rotation is a
      // product decision nobody had made and would be unmeasurable without
      // impression tracking. Both halves are true, but the conclusion was
      // wrong, because the client takes `items[0]` and renders only that one
      // (libs-mobile/api/ads.ts — and it is right to, since ordering is the
      // server's job). Stable order plus take-the-first is not "no rotation
      // policy": it is winner-take-all. The most recently created campaign
      // showed 100% of the time and every other paid sponsor showed never,
      // for as long as it stayed active. That was a product decision too —
      // just one nobody made on purpose, and one no sponsor was told about.
      //
      // Random needs no data the product does not have and no weighting anyone
      // has to agree on: over many requests every active campaign in a
      // placement gets roughly equal exposure. It is the smallest policy that
      // is not a silent monopoly.
      //
      // Still open, and still needing impressions before it can be built:
      // WEIGHTED rotation (by spend, or by a per-campaign share). That is the
      // decision this comment used to be deferring, and it remains deferred.
      .orderBy(sql`random()`)
      .limit(PLACEMENT_LIMIT);

    // An empty list is a normal, expected answer — most placements will have no
    // paid campaign most of the time. The card renders nothing; it must never
    // fall back to a filler sponsor, which is precisely the hardcoded
    // ACTIVE_SPONSORS constant this endpoint exists to delete.
    return { items: rows };
  }
}
