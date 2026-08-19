// Temporary dev-only fallback — see docs/decisions/0007-temporary-dev-otp-fallback.md.
// Used only when MSG91 credentials are absent AND NODE_ENV !== 'production' (enforced
// in auth.ts, not here) — logs the code instead of sending a real SMS, so the rest of
// the flow (Otp -> Permissions -> ProfileSetup -> MainTabs) can be tested before real
// msg91 credentials exist. Remove this file once msg91 is wired for real.

import type { OtpProvider } from './otp-provider.interface';

export class DevConsoleOtpProvider implements OtpProvider {
  async send(phoneNumber: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\n🔑 DEV OTP — no real SMS sent (msg91 not configured)`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Code:  ${code}\n`);
  }
}
