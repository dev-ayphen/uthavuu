// Relative-past formatting ("2 mins ago") — distinct from urgency.ts's
// formatTimeRemaining, which formats time left until a future expiry, not
// elapsed time since a past timestamp.
export function formatRelativeTime(iso: string): string {
  const msElapsed = Date.now() - new Date(iso).getTime();
  if (msElapsed < 60_000) return 'Just now';

  const minutes = Math.floor(msElapsed / 60_000);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
