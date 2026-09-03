import i18next from '../i18n';

// docs/design/design-system.md §5 — TONES thresholds. Urgency is always
// computed from expiryAt, never stored (see report-a-request.md's amended
// BR-2 / the Urgency field decision, 2026-08-19).
export type UrgencyTone = 'normal' | 'soon' | 'critical' | 'expired';

export function getUrgencyTone(expiryAt: string): UrgencyTone {
  const msRemaining = new Date(expiryAt).getTime() - Date.now();
  if (msRemaining <= 0) return 'expired';
  if (msRemaining < 15 * 60_000) return 'critical';
  if (msRemaining < 60 * 60_000) return 'soon';
  return 'normal';
}

/**
 * Time left until a future expiry ("2h left"), as opposed to time elapsed since
 * a past one — that is lib/time.ts's formatRelativeTime.
 *
 * Not a component, so it can't call useTranslation(); it uses i18next's
 * imperative t() directly, exactly as lib/time.ts does, relying on 'common'
 * being the configured defaultNS. This used to return hardcoded English
 * ('Expired', `${n}m left`) — and it renders on every report card, the details
 * screen, My Reports and the 15-minute confirmation countdown, which made it
 * the single most-rendered untranslated string in the app.
 */
export function formatTimeRemaining(expiryAt: string): string {
  const msRemaining = new Date(expiryAt).getTime() - Date.now();
  if (msRemaining <= 0) return i18next.t('expiredLabel');

  const minutes = Math.round(msRemaining / 60_000);
  if (minutes < 60) return i18next.t('minutesLeft', { count: minutes });

  const hours = Math.round(minutes / 60);
  if (hours < 24) return i18next.t('hoursLeft', { count: hours });

  const days = Math.round(hours / 24);
  return i18next.t('daysLeft', { count: days });
}
