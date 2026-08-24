import { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { setUnauthorizedHandler } from '@uthavu/libs-mobile/lib/api';
import type { RootStackParamList } from './types';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import OtpScreen from '../screens/OtpScreen';
import PermissionsScreen from '../screens/PermissionsScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import MainTabs from './MainTabs';
import ReportFlowScreen from '../screens/report/ReportFlowScreen';
import CategoryListScreen from '../screens/discover/CategoryListScreen';
import RequestDetailsScreen from '../screens/request-details/RequestDetailsScreen';
import VolunteerJourneyScreen from '../screens/request-details/VolunteerJourneyScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SavedStoriesScreen from '../screens/SavedStoriesScreen';
import InviteFriendsScreen from '../screens/InviteFriendsScreen';
import MyReportsScreen from '../screens/report/MyReportsScreen';
import EditReportScreen from '../screens/report/EditReportScreen';
import MissionJournalScreen from '../screens/MissionJournalScreen';
import FlaggedCommentsScreen from '../screens/FlaggedCommentsScreen';
import MyImpactStoriesScreen from '../screens/MyImpactStoriesScreen';
import MyTicketsScreen from '../screens/MyTicketsScreen';
import LegalScreen from '../screens/LegalScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// docs/features/impact-story.md US-4 — Share opens uthavu://requests/:id.
// Known, accepted limitation: a signed-out or not-yet-onboarded recipient
// still lands directly on RequestDetails, whose getReport()/getRoster()
// calls fail with an auth error — already handled by the screen's existing
// ErrorState (retry, no crash), just not a polished "log in first" redirect.
const linking = {
  prefixes: ['uthavu://'],
  config: {
    screens: {
      RequestDetails: 'requests/:reportId',
      SavedStories: 'saved-stories',
      MissionJournal: 'mission-journal',
      InviteFriends: 'invite',
      FlaggedComments: 'flagged-comments',
      MyImpactStories: 'impact-stories',
      MyTickets: 'tickets',
    },
  },
};

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function RootNavigator() {
  // Registered once at mount, not per-render — apiRequest() (libs-mobile,
  // outside the navigation tree) calls this synchronously on a real
  // session-expiry 401, so the app lands on Login instead of the generic
  // "check your connection" error state every authed screen otherwise
  // shows for a dead token.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    });
  }, []);

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Otp" component={OtpScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Permissions" component={PermissionsScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />
        <Stack.Screen
          name="ReportFlow"
          component={ReportFlowScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="CategoryList"
          component={CategoryListScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="RequestDetails"
          component={RequestDetailsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="VolunteerJourney"
          component={VolunteerJourneyScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfileScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SavedStories"
          component={SavedStoriesScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="InviteFriends"
          component={InviteFriendsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="MyReports"
          component={MyReportsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="EditReport"
          component={EditReportScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="MissionJournal"
          component={MissionJournalScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="FlaggedComments"
          component={FlaggedCommentsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="MyImpactStories"
          component={MyImpactStoriesScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="MyTickets"
          component={MyTicketsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Legal"
          component={LegalScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="DeleteAccount"
          component={DeleteAccountScreen}
          options={{ animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
