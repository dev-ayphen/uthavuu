import i18next from '../i18n';

// Relative-past formatting ("2 mins ago") — distinct from urgency.ts's
// formatTimeRemaining, which formats time left until a future expiry, not
// elapsed time since a past timestamp. Not a component, so it can't use
// useTranslation() — calls i18next's imperative t() directly instead,
// relying on 'common' being the configured defaultNS.
export function formatRelativeTime(iso: string): string {
  const msElapsed = Date.now() - new Date(iso).getTime();
  if (msElapsed < 60_000) return i18next.t('justNow');

  const minutes = Math.floor(msElapsed / 60_000);
  if (minutes < 60) return i18next.t('minutesAgo', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18next.t('hoursAgo', { count: hours });

  const days = Math.floor(hours / 24);
  return i18next.t('daysAgo', { count: days });
}
