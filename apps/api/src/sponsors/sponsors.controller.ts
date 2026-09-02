import { Controller, Get, Query } from '@nestjs/common';
import { SponsorsService } from './sponsors.service';
import { ListSponsorsDto } from './dto/list-sponsors.dto';

/**
 * The sponsor creatives the mobile app renders, one placement at a time.
 *
 * Authenticated — the global AuthGuard from @thallesp/nestjs-better-auth covers
 * this with no decorator needed, and there is deliberately no @Public() here.
 * Every surface that shows a `<SponsorCard>` (home feed, community impact,
 * impact stories, category list) is behind sign-in already, so a public variant
 * would widen the attack surface for nothing — and an unauthenticated ad
 * endpoint is a free scraping target for a competitor wanting the client list.
 *
 * No role branch, per ADR 0009: the admin surface is AdminSponsorsController
 * under /admin, and an admin calling this route gets exactly what a citizen
 * gets — including not seeing their own paused campaigns.
 *
 * NOTE FOR ANYONE ADDING TO THIS FILE: nothing here may ever sit in front of a
 * mission action. Accepting a request, revealing an emergency contact,
 * navigating to a location and completing a mission must not acquire a
 * dependency on a sponsor lookup. This endpoint is read-only, additive, and
 * called by cards that render beside content — never by a gate in front of it.
 */
@Controller('sponsors')
export class SponsorsController {
  constructor(private readonly sponsorsService: SponsorsService) {}

  @Get()
  list(@Query() query: ListSponsorsDto) {
    return this.sponsorsService.list(query.placement);
  }
}
