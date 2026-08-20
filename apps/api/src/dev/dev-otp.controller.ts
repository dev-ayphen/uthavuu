import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { redis } from '../lib/redis';

// Only ever registered when the dev OTP fallback itself is active (see
// app.module.ts's guard, mirroring auth.ts's hasMsg91Credentials/NODE_ENV
// check exactly) — lets Maestro E2E flows retrieve the OTP a real device
// can't read from `docker compose logs` without shell access. Never exists
// in production: the module simply isn't imported there. @AllowAnonymous
// is required — the global AuthGuard would otherwise block this before a
// session exists, which defeats the point (this endpoint's whole job is
// letting an unauthenticated flow retrieve the code needed to log in).
@Controller('dev/otp')
@AllowAnonymous()
export class DevOtpController {
  @Get()
  async getLastCode(@Query('phone') phone?: string) {
    if (!phone) throw new NotFoundException('phone query param required');
    const code = await redis.get(`otp:dev-last-code:${phone}`);
    if (!code) throw new NotFoundException('No OTP sent for this phone number yet');
    return { code };
  }
}
