import { createZodDto } from 'nestjs-zod';
import {
  CommunityUpdateFieldsSchema,
  EXPIRES_AFTER_PUBLISH_MESSAGE,
  expiresAfterPublish,
} from './create-community-update.dto';

/**
 * Every editable field, all optional.
 *
 * `status` is deliberately absent. Publishing and archiving are their own
 * endpoints (`POST :id/publish`, `POST :id/archive`) because each is a distinct
 * audited action — `community_update.publish` and `community_update.archive`
 * are separate catalogue keys, and a status buried inside a general-purpose
 * PATCH would collapse both into an indistinguishable `community_update.update`
 * row. "Who published this" is exactly the question the audit trail exists to
 * answer.
 *
 * `.partial()` is applied to the raw object schema before either refinement:
 * `.partial()` cannot be called on a refined schema (a ZodEffects has no field
 * map to make optional), which is why create-community-update.dto.ts exports
 * the bare object and the predicate separately rather than a finished schema to
 * subtract from. There are no `.default()`s on any field, so this partial does
 * not carry the hazard update-report-category.dto.ts documents — a defaulted
 * field survives `.partial()` and silently writes itself on an empty PATCH.
 */
export const UpdateCommunityUpdateSchema = CommunityUpdateFieldsSchema.partial()
  .refine((body) => Object.keys(body).length > 0, {
    // Read as a machine-readable code by the console, matching
    // UpdateReportCategorySchema. A PATCH with an empty body is almost always a
    // client bug (a form that serialised nothing), and answering 200 "updated"
    // to it would hide that.
    message: 'NO_FIELDS_TO_UPDATE',
  })
  // Catches only the case where both timestamps arrive together. The
  // send-one-field case is checked against the stored row in the service — see
  // the note on this predicate's definition.
  .refine(expiresAfterPublish, {
    message: EXPIRES_AFTER_PUBLISH_MESSAGE,
    path: ['expiresAt'],
  });

export class UpdateCommunityUpdateDto extends createZodDto(
  UpdateCommunityUpdateSchema,
) {}
