import type { CategoryId } from '@uthavu/libs-mobile/data/categories';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  Otp: { phone: string };
  Permissions: undefined;
  ProfileSetup: { lat: number; lng: number; city: string; district: string };
  MainTabs: undefined;
  ReportFlow: { categoryKey: CategoryId };
  CategoryList: {
    categoryKey: CategoryId;
    lat: number;
    lng: number;
    radiusKm: 1 | 3 | 5 | 10;
    locationLabel: string;
  };
  RequestDetails: { reportId: string };
};
