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
  SupportHome: undefined;
  // Optional param so a future "report a problem with this request" entry point
  // can file a ticket against a report; the API takes relatedReportId as a
  // reference only (it grants no access to that report).
  SubmitTicket: { relatedReportId?: string } | undefined;
  // ticketNumber is passed so the header reads "Ticket #UT-1042" from the first
  // frame instead of flashing a placeholder while the thread loads. The screen
  // still prefers the number the API returns once it has it.
  TicketDetail: { ticketId: string; ticketNumber: string };
  Legal: { topic: 'terms' | 'privacy' | 'guidelines' };
  DeleteAccount: undefined;
};
