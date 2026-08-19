import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RegisterDeviceSchema = z.object({
  token: z.string().trim().min(1, 'token is required'),
  platform: z.enum(['ios', 'android']),
});

export class RegisterDeviceDto extends createZodDto(RegisterDeviceSchema) {}
