// Matches apps/api/src/impact-stories/* — the union of reports I posted
// and missions I volunteered for, both filtered to completed.
import { apiRequest } from '../lib/api';
import type { CategoryId } from '../data/categories';

export type ImpactStory = {
  reportId: string;
  title: string;
  category: { key: CategoryId; label: string; emoji: string };
  photo: string | null;
};

export function listMyImpactStories(): Promise<ImpactStory[]> {
  return apiRequest('/users/me/impact-stories', { method: 'GET', auth: true });
}
