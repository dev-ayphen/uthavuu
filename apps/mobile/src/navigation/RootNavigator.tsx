import { useEffect } from 'react';
import { Alert } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  MAINTENANCE_MODE,
  setPlatformBlockedHandler,
  setSuspendedHandler,
  setUnauthorizedHandler,
} from '@uthavu/libs-mobile/lib/api';
import { clearToken } from '@uthavu/libs-mobile/lib/session';
import i18n from '@uthavu/libs-mobile/i18n';
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
import SupportHomeScreen from '../screens/support/SupportHomeScreen';
import SubmitTicketScreen from '../screens/support/SubmitTicketScreen';
import TicketDetailScreen from '../screens/support/TicketDetailScreen';
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
      SupportHome: 'support',
      SubmitTicket: 'support/submit',
      TicketDetail: 'support/tickets/:ticketId',
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

    // A suspended account is told why, once, and then sent to Login — rather
    // than left tapping a screen that fails silently. Deliberately NOT the same
    // path as an expired session: the API leaves the session valid so this
    // message can be shown, so the token is cleared here instead, after the
    // user has actually read it. `suspendedShown` keeps a burst of parallel
    // failed requests from stacking identical alerts.
    let suspendedShown = false;
    // i18n.t at alert time, not a captured `t` — same reason as the platform
    // handler below: this effect's dep array is empty, so a captured
    // translator would be stuck in the mount-time language.
    //
    // The server's `message` is deliberately IGNORED. It is a plain English
    // constant (apps/api account-status.ts ACCOUNT_SUSPENDED_MESSAGE), not one
    // of the locale-rendered alert templates, so the catalogue is strictly
    // more correct for a Tamil user. The API stays the authority on WHETHER
    // the account is suspended; the client owns how that is said.
    setSuspendedHandler(() => {
      if (suspendedShown) return;
      suspendedShown = true;
      Alert.alert(i18n.t('auth:accountSuspendedTitle'), i18n.t('auth:accountSuspendedError'), [
        {
          text: 'OK',
          onPress: () => {
            suspendedShown = false;
            void clearToken().then(() => {
              if (navigationRef.isReady()) {
                navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
              }
            });
          },
        },
      ]);
    });

    // An admin has frozen writes platform-wide (console → Platform tab,
    // surfaced to this client as maintenanceMode/readOnlyMode on GET /config).
    // Unlike the two handlers above this one does NOT navigate and does NOT
    // touch the token — the session is fine and the user can still read
    // everything. It only replaces the generic failure the screen would
    // otherwise show with the actual reason. `blockShown` keeps a burst of
    // parallel rejected writes from stacking identical alerts, the same guard
    // `suspendedShown` provides above.
    //
    // i18n.t is called at alert time rather than a `t` captured by this
    // effect's empty dep array — otherwise the message would be stuck in
    // whatever language was active at mount, ignoring a later Settings switch.
    let blockShown = false;
    setPlatformBlockedHandler((code) => {
      if (blockShown) return;
      blockShown = true;
      const maintenance = code === MAINTENANCE_MODE;
      Alert.alert(
        i18n.t(maintenance ? 'common:maintenanceTitle' : 'common:readOnlyTitle'),
        i18n.t(maintenance ? 'common:maintenanceMessage' : 'common:readOnlyMessage'),
        [
          {
            text: i18n.t('common:ok'),
            onPress: () => {
              blockShown = false;
            },
          },
        ]
      );
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
          name="SupportHome"
          component={SupportHomeScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SubmitTicket"
          component={SubmitTicketScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="TicketDetail"
          component={TicketDetailScreen}
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
