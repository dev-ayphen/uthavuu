// How a ticket's server-owned status is presented. The client never sets or
// advances a status — this module only decides what colour and what words the
// status it was handed gets.
import type { TFunction } from 'i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { TONES } from '@uthavu/libs-mobile/theme/tokens';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import type { TicketStatus } from '@uthavu/libs-mobile/api/tickets';

export type StatusTone = { fg: string; fill: string; border: string };

/**
 * docs/design/design-system.md §01: "colour is earned". A ticket stays neutral
 * slate while support has the ball, warms to amber once work is actually
 * underway, and only goes red when the user is the one holding it up — the one
 * state that genuinely asks something of them. Resolved earns the app's real
 * success green; closed drops to the muted `expired` tone, the same treatment a
 * shut window gets everywhere else in the app.
 *
 * An unrecognised key falls through to `normal` rather than to an alarming
 * tone: a status this build has never heard of is not evidence of urgency.
 */
export function statusTone(statusKey: string, colors: ColorScheme): StatusTone {
  switch (statusKey) {
    case 'in_progress':
      return TONES.soon;
    case 'waiting_for_user':
      return TONES.critical;
    case 'resolved':
      return {
        fg: colors.primaryGreen,
        fill: colors.primaryGreenLight,
        border: colors.primaryGreen,
      };
    case 'closed':
      return TONES.expired;
    default:
      return TONES.normal;
  }
}

/**
 * The catalog label for a known status, the server's own label for one this
 * build doesn't know, and the bare key as the last resort. Never a guess.
 */
export function statusLabel(status: TicketStatus, t: TFunction): string {
  if (!status.key) return status.label;
  return t(`status.${status.key}`, { defaultValue: status.label || status.key });
}

/**
 * `formatRelativeTime` on an empty or unparseable timestamp yields "NaN minutes
 * ago". Callers render nothing at all instead — a missing time is better left
 * unsaid than said wrongly.
 */
export function relativeTimeOrNull(iso: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return null;
  return formatRelativeTime(iso);
}
