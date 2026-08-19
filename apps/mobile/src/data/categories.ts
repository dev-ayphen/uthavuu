import { CATEGORY_COLORS } from '../theme/tokens';

// docs/features/report-a-request.md US-1: 8 citizen-selectable categories.
// Disaster Relief is deliberately absent — admin-only, per BR-3.
export type CategoryId =
  | 'animalRescue'
  | 'medicalHelp'
  | 'foodDonation'
  | 'roadsideHelp'
  | 'elderlySupport'
  | 'bloodDonation'
  | 'communityHelp'
  | 'lostAndFound';

export const CATEGORIES: Array<{ id: CategoryId; title: string; emoji: string; color: string }> = [
  { id: 'animalRescue', title: 'Animal Rescue', emoji: '🐶', color: CATEGORY_COLORS.animalRescue },
  { id: 'medicalHelp', title: 'Medical Help', emoji: '❤️', color: CATEGORY_COLORS.medicalHelp },
  { id: 'foodDonation', title: 'Food Donation', emoji: '🍱', color: CATEGORY_COLORS.foodDonation },
  { id: 'roadsideHelp', title: 'Roadside Help', emoji: '🚗', color: CATEGORY_COLORS.roadsideHelp },
  { id: 'elderlySupport', title: 'Elderly Support', emoji: '👴', color: CATEGORY_COLORS.elderlySupport },
  { id: 'bloodDonation', title: 'Blood Donation', emoji: '🩸', color: CATEGORY_COLORS.bloodDonation },
  { id: 'communityHelp', title: 'Community Help', emoji: '🤝', color: CATEGORY_COLORS.communityHelp },
  { id: 'lostAndFound', title: 'Lost & Found', emoji: '🔍', color: CATEGORY_COLORS.lostAndFound },
];
