// Matches apps/api/src/missions/* — see docs/features/accept-and-mission-chat.md.
import { apiRequest } from '../lib/api';

export type VolunteerStatus = 'joined' | 'active' | 'released';

// Separate from VolunteerStatus (participation — is this volunteer part of
// the mission) — this is what an *active* volunteer is currently doing.
// Only ever set once participation status is 'active'.
export type ProgressStatus = 'on_the_way' | 'reached_location' | 'helping_now';

export type ProgressStatusInfo = {
  key: ProgressStatus;
  label: string;
  onWayAt: string | null;
  reachedAt: string | null;
  helpingAt: string | null;
};

export type RosterVolunteer = {
  id: string;
  // Null when this volunteer's account has been deleted — their
  // participation row (and history) survives, only the identity goes. See
  // volunteerDeleted.
  volunteerId: string | null;
  name: string;
  volunteerDeleted: boolean;
  avatarUrl: string | null;
  status: VolunteerStatus;
  confirmDeadline: string | null;
  joinedAt: string;
  progressStatus: ProgressStatusInfo | null;
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
  myProgressStatus: ProgressStatusInfo | null;
  completion: MissionCompletion | null;
};

export type MissionMessage = {
  id: string;
  senderId: string | null;
  senderName: string;
  senderDeleted: boolean;
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

// Only accepted while the caller's own participation status is 'active' —
// Start Helping (confirmRequest) is a precondition, not implied.
export function updateMissionProgress(reportId: string, status: ProgressStatus): Promise<Roster> {
  return apiRequest(`/reports/${reportId}/volunteers/me/progress`, {
    method: 'PATCH',
    auth: true,
    body: { status },
  });
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
  // Null either because the report is anonymous or because the reporter's
  // account has been deleted — check reporterDeleted before rendering.
  reporterName: string | null;
  reporterDeleted: boolean;
  myStatus: VolunteerStatus;
  myConfirmDeadline: string | null;
  joinedAt: string;
};

export function getMyMissions(): Promise<MyMission[]> {
  return apiRequest('/users/me/missions', { method: 'GET', auth: true });
}
