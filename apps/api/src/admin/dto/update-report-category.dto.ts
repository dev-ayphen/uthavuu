import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CreateReportCategorySchema } from './create-report-category.dto';

/**
 * `key` is deliberately absent, and that omission is load-bearing.
 *
 * Three separate things address a category by its key, none of which would
 * notice it changing: the mobile app posts `categoryKey` when creating a report
 * (`CreateReportSchema`), `db:seed` upserts ON CONFLICT (key), and the citizen
 * category list is keyed by it. Renaming `animalRescue` to `petRescue` would
 * therefore not "rename a category" — it would orphan the old key for every
 * client still sending it, and the next `db:seed` would helpfully re-create
 * `animalRescue` as a second, empty category alongside it.
 *
 * A category whose key is wrong is created wrong. Delete it (or retire it with
 * `citizenSelectable: false`) and create the right one.
 */
export const UpdateReportCategorySchema = CreateReportCategorySchema.omit({
  key: true,
})
  // citizenSelectable is re-declared WITHOUT its create-time `.default(true)`,
  // and that is not tidying — it is a bug fix. Verified against zod 4.4.3:
  // `.partial()` does not suppress a `ZodDefault`, so
  // `CreateReportCategorySchema.omit({key:true}).partial().parse({})` returns
  // `{ citizenSelectable: true }`, not `{}`. Left alone, a PATCH with an empty
  // body would have slipped past the "no fields" refine below AND silently
  // flipped the category to citizen-selectable — which on `disasterRelief`
  // means quietly publishing a category BR-3 says citizens may not post to.
  // A default belongs on creation, never on a partial update.
  .extend({ citizenSelectable: z.boolean().optional() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    // Read as a machine-readable code by the console — see the endpoint contract.
    // A PATCH with an empty body is almost always a client bug (a form that
    // serialised nothing), and answering 200 "updated" to it would hide that.
    message: 'NO_FIELDS_TO_UPDATE',
  });

export class UpdateReportCategoryDto extends createZodDto(
  UpdateReportCategorySchema,
) {}
