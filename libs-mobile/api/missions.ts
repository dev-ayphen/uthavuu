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

export type MissionCompletion = {
  photoUrl: string;
  note: string;
  verifiedAt: string;
};

export type Roster = {
  neededVolunteers: number;
  volunteers: RosterVolunteer[];
  myStatus: VolunteerStatus | null;
  myConfirmDeadline: string | null;
  completion: MissionCompletion | null;
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

export function completeMission(reportId: string, photoUrl: string, note: string): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/complete`, {
    method: 'POST',
    auth: true,
    body: { photoUrl, note },
  });
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

export type MyMission = {
  reportId: string;
  title: string;
  category: { key: string; label: string; emoji: string };
  reportStatus: string;
  photo: string | null;
  landmark: string | null;
  lat: number;
  lng: number;
  reporterName: string | null;
  myStatus: VolunteerStatus;
  myConfirmDeadline: string | null;
  joinedAt: string;
};

export function getMyMissions(): Promise<MyMission[]> {
  return apiRequest('/users/me/missions', { method: 'GET', auth: true });
}
