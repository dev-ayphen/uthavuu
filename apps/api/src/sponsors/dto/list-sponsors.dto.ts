import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SPONSOR_PLACEMENT_KEYS } from '../../db/schema/sponsors-schema';

/**
 * `GET /sponsors?placement=…`
 *
 * `placement` is REQUIRED, and that is the design rather than an omission. A
 * sponsor card lives in exactly one surface — `<SponsorCard placement="home"/>`
 * — so "give me all the sponsors" is not a question any client has. Making it
 * optional would mean choosing a default, and the only honest default (return
 * everything) is the one that puts an impact-stories creative in the home feed.
 *
 * `z.enum` over the shared constant, NOT a free string validated later. Unlike
 * the status and creative-type filters elsewhere in this API — which are lookup
 * tables where a new row must not require a redeploy — the placement set is a
 * closed contract with a mobile component's props
 * (db/schema/sponsors-schema.ts explains why it is not a lookup table). A key
 * this build has no renderer for is a client bug worth a 400, not an empty list
 * the caller has to guess about.
 */
export const ListSponsorsSchema = z.object({
  placement: z.enum(SPONSOR_PLACEMENT_KEYS),
});

export class ListSponsorsDto extends createZodDto(ListSponsorsSchema) {}
