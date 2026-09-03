// Matches apps/api/src/alerts/*.
import { apiRequest } from '../lib/api';

/**
 * Every tag `alerts.type` can hold — not only the ones this app has copy for.
 *
 * `alerts.type` is plain text with no FK (apps/api/src/db/schema/alerts-schema.ts):
 * an event-log discriminator, so a tag no template covers is a legitimate value
 * rather than a hole. Listing only the templated three made the other two
 * unmodelled, which is how `report_cancelled` reached a Tamil user in English —
 * it had no catalogue entry, so it fell through to the server's stored copy,
 * which AlertsService always renders in DEFAULT_ALERT_LOCALE.
 *
 * `broadcast` is here for completeness and has NO catalogue entry by design:
 * its prose is typed by a member of staff, so there is no template to look up.
 * The server stores it already rendered in the recipient's own locale
 * (admin-broadcasts.service.ts), and the fallback path below is what shows it.
 */
export type AlertType =
  | 'volunteer_accepted'
  | 'volunteer_released'
  | 'mission_completed'
  | 'report_cancelled'
  | 'broadcast';

// The structured payload the alert's text is rendered from — mirrors
// AlertParams in apps/api/src/alerts/alert-templates.ts. `volunteerName` is
// null when the volunteer has no name on file; each locale supplies its own
// wording for that case rather than inheriting an English "A volunteer".
export type AlertParams = {
  volunteerName: string | null;
  reportTitle: string;
};

export type Alert = {
  id: string;
  type: AlertType;
  // The server's English rendering. Only used as a fallback for an alert
  // `type` this build has no catalog entry for — normally the app renders
  // from `type` + `params` so the text follows the current language.
  title: string;
  body: string;
  params: AlertParams;
  reportId: string | null;
  read: boolean;
  createdAt: string;
};

export function getAlerts(): Promise<Alert[]> {
  return apiRequest('/users/me/alerts', { method: 'GET', auth: true });
}

export function markAllAlertsRead(): Promise<Alert[]> {
  return apiRequest('/users/me/alerts/read', { method: 'PATCH', auth: true });
}
