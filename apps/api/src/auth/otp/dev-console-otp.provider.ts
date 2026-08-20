// Temporary dev-only fallback — see docs/decisions/0007-temporary-dev-otp-fallback.md.
// Used only when MSG91 credentials are absent AND NODE_ENV !== 'production' (enforced
// in auth.ts, not here) — logs the code instead of sending a real SMS, so the rest of
// the flow (Otp -> Permissions -> ProfileSetup -> MainTabs) can be tested before real
// msg91 credentials exist. Remove this file once msg91 is wired for real.

import type { OtpProvider } from './otp-provider.interface';
import { redis } from '../../lib/redis';

// Also cached in Redis (same 5-min TTL as Better Auth's own expiresIn) so
// DevOtpController can hand it to Maestro E2E flows via HTTP instead of
// needing shell/filesystem access to `docker compose logs` — that
// controller is gated by the exact same NODE_ENV/MSG91 check as this
// provider itself.
const OTP_TTL_SECONDS = 300;

export class DevConsoleOtpProvider implements OtpProvider {
  async send(phoneNumber: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\n🔑 DEV OTP — no real SMS sent (msg91 not configured)`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Code:  ${code}\n`);
    await redis.set(`otp:dev-last-code:${phoneNumber}`, code, 'EX', OTP_TTL_SECONDS);
  }
}
