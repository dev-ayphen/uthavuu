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

export function formatTimeRemaining(expiryAt: string): string {
  const msRemaining = new Date(expiryAt).getTime() - Date.now();
  if (msRemaining <= 0) return 'Expired';

  const minutes = Math.round(msRemaining / 60_000);
  if (minutes < 60) return `${minutes}m left`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h left`;

  const days = Math.round(hours / 24);
  return `${days}d left`;
}
