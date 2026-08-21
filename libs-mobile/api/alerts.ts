// Matches apps/api/src/alerts/*.
import { apiRequest } from '../lib/api';

export type AlertType = 'volunteer_accepted' | 'volunteer_released' | 'mission_completed';

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
