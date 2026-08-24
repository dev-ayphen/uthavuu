import type { CategoryId } from '@uthavu/libs-mobile/data/categories';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  Otp: { phone: string };
  Permissions: undefined;
  ProfileSetup: { lat: number; lng: number; city: string; district: string };
  MainTabs: undefined;
  EditProfile: undefined;
  Settings: undefined;
  ReportFlow: { categoryKey?: CategoryId };
  CategoryList: {
    categoryKey: CategoryId;
    lat: number;
    lng: number;
    radiusKm: 1 | 3 | 5 | 10;
    locationLabel: string;
  };
  RequestDetails: { reportId: string };
  VolunteerJourney: { reportId: string };
  SavedStories: undefined;
  InviteFriends: undefined;
  MyReports: undefined;
  EditReport: { reportId: string };
  MissionJournal: undefined;
  FlaggedComments: undefined;
  MyImpactStories: undefined;
  MyTickets: undefined;
  Legal: { topic: 'terms' | 'privacy' | 'guidelines' };
  DeleteAccount: undefined;
};
