// Matches apps/api/src/missions/* — see docs/features/accept-and-mission-chat.md.
import { apiRequest } from '../lib/api';

export type VolunteerStatus = 'joined' | 'active' | 'released';

export type RosterVolunteer = {
  id: string;
  volunteerId: string;
  name: string;
  avatarUrl: string | null;
  status: VolunteerStatus;
  confirmDeadline: string | null;
  joinedAt: string;
};

export type Roster = {
  neededVolunteers: number;
  volunteers: RosterVolunteer[];
  myStatus: VolunteerStatus | null;
  myConfirmDeadline: string | null;
};

export type MissionMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

export function getRoster(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers`, { method: 'GET', auth: true });
}

export function acceptRequest(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers`, { method: 'POST', auth: true });
}

export function confirmRequest(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers/me`, { method: 'PATCH', auth: true });
}

export function leaveRequest(reportId: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers/me`, { method: 'DELETE', auth: true });
}

export function listMissionMessages(reportId: string): Promise<MissionMessage[]> {
  return apiRequest(`/reports/${reportId}/messages`, { method: 'GET', auth: true });
}

export function sendMissionMessage(reportId: string, body: string): Promise<MissionMessage[]> {
  return apiRequest(`/reports/${reportId}/messages`, {
    method: 'POST',
    auth: true,
    body: { body },
  });
}
