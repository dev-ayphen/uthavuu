// Matches apps/api/src/alerts/*.
import { apiRequest } from '../lib/api';

export type AlertType = 'volunteer_accepted' | 'volunteer_released';

export type Alert = {
  id: string;
  type: AlertType;
  title: string;
  body: string;
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
