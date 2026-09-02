import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// An empty string from an optional client field should mean "not provided",
// not "provided as blank" — this turns '' into undefined before validating,
// so the field is skipped in UsersService's update rather than saved as ''.
function optionalTrimmed<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional()
  );
}

// docs/features/auth.md BR-5: Full Name is the only required signup field.
// city/district are here as the client's reverse-geocode result — a
// human-readable label only (BR-4), lat/lng are the authoritative location.
// BR-5a: contactEmail is a display-only field, never wired into Better Auth's
// own email/emailVerified columns — see UsersService.completeProfile.
export const CompleteProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  city: z.string().trim(),
  district: z.string().trim(),
  contactEmail: optionalTrimmed(z.string().trim().email('Enter a valid email')),
  language: optionalTrimmed(z.string().trim().max(50)),
  profession: optionalTrimmed(z.string().trim().max(80)),
  organization: optionalTrimmed(z.string().trim().max(120)),
  showProfession: z.boolean().optional(),
  // Syntax only. UsersService.completeProfile() confirms it is a file this API
  // actually served — see ../../uploads/stored-upload.ts.
  avatarUrl: optionalTrimmed(z.string().trim().url()),
});

export class CompleteProfileDto extends createZodDto(CompleteProfileSchema) {}
