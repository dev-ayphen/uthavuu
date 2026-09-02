import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PLATFORM_SETTINGS_BOUNDS } from '../../db/schema/settings-schema';

/**
 * Clearable free-text: absent means "leave it alone", `null` OR an empty string
 * means "clear it".
 *
 * Deliberately the opposite of `optionalTrimmed` in
 * users/dto/complete-profile.dto.ts, where '' means "not provided". On a
 * settings form an operator who empties the support-phone box means to remove
 * it, and a PATCH that silently ignored that would be a field the console
 * cannot clear — a small version of exactly the disconnected-control failure
 * this whole feature exists to avoid.
 */
function clearableTrimmed<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    schema.nullable().optional(),
  );
}

const RADIUS_OPTIONS = PLATFORM_SETTINGS_BOUNDS.defaultRadiusKmOptions;

/**
 * `PATCH /admin/settings` — any subset of the settable fields.
 *
 * Every bound here is read from PLATFORM_SETTINGS_BOUNDS, the same constant the
 * CHECK constraints in db/schema/settings-schema.ts are built from. The two
 * layers are not redundant: this one exists so the console gets a clean 400
 * naming the field, and the constraints exist so the invariant still holds for
 * a psql session or a DTO somebody loosens by accident.
 */
export const UpdatePlatformSettingsSchema = z
  .object({
    appName: z
      .string()
      .trim()
      .min(PLATFORM_SETTINGS_BOUNDS.appName.minLength, 'App name is required')
      .max(PLATFORM_SETTINGS_BOUNDS.appName.maxLength)
      .optional(),

    // Nullable because this product has no email provider (ADR 0003) — the
    // address is a string shown to citizens on the Help screen, and "we don't
    // publish one" is a valid state.
    supportEmail: clearableTrimmed(
      z.string().trim().email('Enter a valid email').max(200),
    ),
    supportPhone: clearableTrimmed(z.string().trim().max(32)),

    maxPhotosPerReport: z
      .number()
      .int()
      .min(PLATFORM_SETTINGS_BOUNDS.maxPhotosPerReport.min)
      .max(PLATFORM_SETTINGS_BOUNDS.maxPhotosPerReport.max)
      .optional(),

    maxVolunteersPerReport: z
      .number()
      .int()
      .min(PLATFORM_SETTINGS_BOUNDS.maxVolunteersPerReport.min)
      .max(PLATFORM_SETTINGS_BOUNDS.maxVolunteersPerReport.max)
      .optional(),

    // Not a range: these are the four radius chips the mobile discovery screen
    // can actually render. A value outside the set would be stored, returned by
    // GET /config, and then silently ignored by the client — a disconnected
    // setting by a different route.
    defaultRadiusKm: z
      .number()
      .int()
      .refine(
        (value) => (RADIUS_OPTIONS as readonly number[]).includes(value),
        {
          message: `defaultRadiusKm must be one of ${RADIUS_OPTIONS.join(', ')}`,
        },
      )
      .optional(),

    allowAnonymousReports: z.boolean().optional(),
    commentsEnabled: z.boolean().optional(),
    commentFlaggingEnabled: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
    readOnlyMode: z.boolean().optional(),
  })
  // Cross-field, because no single field can express it: a PATCH has to change
  // something. Without this, `PATCH {}` would succeed and write a
  // `platform_setting.update` audit row recording a change that never happened
  // — the audit trail's equivalent of a toggle wired to nothing.
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'Provide at least one setting to update.',
  });

export class UpdatePlatformSettingsDto extends createZodDto(
  UpdatePlatformSettingsSchema,
) {}
