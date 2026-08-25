// Matches apps/api/src/comments/* — docs/PRODUCT-DECISIONS.md Decision 2's
// public Community Comments (distinct from private Mission Chat, see
// api/missions.ts's message functions).
import { apiRequest } from '../lib/api';

export type FlagReason = 'spam' | 'abuse' | 'false_information' | 'duplicate' | 'other';

// No admin console exists yet to move a flag past 'submitted' — every flag
// stays here today. Real and honest, not a gap: see comments-schema.ts's
// own comment on flag_statuses for why the column exists regardless.
export type FlagStatus = 'submitted' | 'under_review' | 'action_taken' | 'dismissed';

export type Comment = {
  id: string;
  authorId: string | null;
  authorName: string;
  authorDeleted: boolean;
  authorIsReporter: boolean;
  body: string;
  createdAt: string;
};

export function listComments(reportId: string): Promise<Comment[]> {
  return apiRequest(`/reports/${reportId}/comments`, { method: 'GET', auth: true });
}

export function postComment(reportId: string, body: string): Promise<Comment[]> {
  return apiRequest(`/reports/${reportId}/comments`, { method: 'POST', auth: true, body: { body } });
}

export function flagComment(reportId: string, commentId: string, reason: FlagReason): Promise<{ flagged: boolean }> {
  return apiRequest(`/reports/${reportId}/comments/${commentId}/flag`, {
    method: 'POST',
    auth: true,
    body: { reason },
  });
}

export type FlaggedComment = {
  id: string;
  reason: FlagReason;
  status: FlagStatus;
  flaggedAt: string;
  commentBody: string;
  reportId: string;
  reportTitle: string;
  reportLandmark: string | null;
  reportStatus: string;
  category: { key: string; label: string; emoji: string };
};

export function listMyFlaggedComments(): Promise<FlaggedComment[]> {
  return apiRequest('/users/me/flagged-comments', { method: 'GET', auth: true });
}
