import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// docs/features/discover-nearby-requests.md BR-1/BR-2: fixed 1/3/5/10 km options.
export const UpdateRadiusSchema = z.object({
  radius: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)]),
});

export class UpdateRadiusDto extends createZodDto(UpdateRadiusSchema) {}
