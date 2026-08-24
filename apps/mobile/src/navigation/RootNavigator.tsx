import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
    },
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer linking={linking}>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
