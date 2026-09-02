import { createZodDto } from 'nestjs-zod';
import {
  END_AFTER_START_MESSAGE,
  SponsorFieldsSchema,
  endAfterStart,
} from './create-sponsor.dto';

/**
 * Every editable field, all optional.
 *
 * `status` is absent for the reason create-sponsor.dto.ts gives: pausing and
 * activating are their own endpoints because each is a distinct audited action.
 *
 * `.partial()` is applied to the raw object schema before either refinement:
 * it cannot be called on a refined schema (a ZodEffects has no field map to
 * make optional), which is why create-sponsor.dto.ts exports the bare object
 * and the predicate separately rather than a finished schema to subtract from.
 * There are no `.default()`s on any field, so this partial does not carry the
 * hazard update-report-category.dto.ts documents — a defaulted field survives
 * `.partial()` and silently writes itself on an empty PATCH.
 *
 * ON `placements`: a supplied array REPLACES the stored set entirely, it does
 * not merge. `[]` is therefore meaningful and is not the same as omitting the
 * key — it removes the sponsor from every surface while leaving the campaign
 * otherwise intact, which is a legitimate thing to want and is distinct from
 * pausing it. Omitting the key leaves the placements untouched.
 */
export const UpdateSponsorSchema = SponsorFieldsSchema.partial()
  .refine((body) => Object.keys(body).length > 0, {
    // Read as a machine-readable code by the console, matching
    // UpdateCommunityUpdateSchema and UpdateReportCategorySchema. A PATCH with
    // an empty body is almost always a client bug (a form that serialised
    // nothing), and answering 200 "updated" to it would hide that.
    message: 'NO_FIELDS_TO_UPDATE',
  })
  // Catches only the case where both bounds arrive together. The
  // send-one-field case is checked against the stored row in the service — see
  // the note on this predicate's definition.
  .refine(endAfterStart, {
    message: END_AFTER_START_MESSAGE,
    path: ['endDate'],
  });

export class UpdateSponsorDto extends createZodDto(UpdateSponsorSchema) {}
