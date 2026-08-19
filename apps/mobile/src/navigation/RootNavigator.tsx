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

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
