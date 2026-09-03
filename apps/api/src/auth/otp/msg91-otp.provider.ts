// Verified against msg91's real Send OTP API shape (docs.msg91.com/otp/sendotp,
// api.msg91.com/api/v5/otp) — not implemented from memory. The `otp` query param
// lets us pass the exact code Better Auth already generated and stored, so Better
// Auth stays the single source of truth for what a "correct" code is; msg91 only
// delivers it.
//
// MSG91_AUTH_KEY / MSG91_TEMPLATE_ID are unset until a real msg91 account exists —
// see docs/decisions/0006-otp-via-msg91-from-the-start.md. Every call throws until
// then; there is no dev-mode fallback (that was the decision this ADR supersedes).

import type { OtpProvider } from './otp-provider.interface';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';
const OTP_EXPIRY_MINUTES = 5;

export class Msg91OtpProvider implements OtpProvider {
  async send(phoneNumber: string, code: string): Promise<void> {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {
      throw new Error(
        'MSG91_AUTH_KEY / MSG91_TEMPLATE_ID are not configured — cannot send a real OTP.',
      );
    }

    // msg91 wants the number with country code, no leading "+" (e.g. "919876543210").
    const mobile = phoneNumber.replace(/^\+/, '');

    const url = new URL(MSG91_OTP_URL);
    url.searchParams.set('template_id', templateId);
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('otp', code);
    url.searchParams.set('otp_expiry', String(OTP_EXPIRY_MINUTES));

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { authkey: authKey, 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`msg91 send OTP failed (${res.status}): ${body}`);
    }
  }
}
