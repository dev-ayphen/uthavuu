import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, Heart, Home, Plus, User } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import type { MainTabParamList } from './tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { registerForPushNotifications } from '@uthavu/libs-mobile/lib/push';
import { getAlerts } from '@uthavu/libs-mobile/api/alerts';
import DashboardScreen from '../screens/tabs/DashboardScreen';
import MyHelpsScreen from '../screens/tabs/MyHelpsScreen';
import ReportCategoryScreen from '../screens/report/ReportCategoryScreen';
import AlertsScreen from '../screens/tabs/AlertsScreen';
import ProfileScreen from '../screens/tabs/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

// docs/mobile/07-main-tabs.md gap #2: the documented prototype hardcodes bar
// height/padding (80 / 22) despite SafeAreaProvider being mounted. Fixed here —
// real safe-area insets. Gap #5 (FAB has no accessibility label) and gap #3
// (inconsistent active-fill alpha) are also fixed rather than reproduced.
export default function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // MainTabs only renders once a session exists — a natural "user is
  // logged in" hook point for registering this device's push token.
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Same ['alerts'] query key AlertsScreen uses — shares its cache, so
  // opening the tab doesn't trigger a second fetch and the badge updates
  // the moment AlertsScreen's own query resolves (e.g. after mark-all-read).
  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: getAlerts });
  const unreadCount = alerts?.filter((a) => !a.read).length ?? 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryGreen,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { ...TYPE.captionStrong, fontWeight: '700', letterSpacing: 0.2 },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Home size={22} color={color} strokeWidth={focused ? 2.5 : 1.8} />
          ),
        }}
      />
      <Tab.Screen
        name="MyHelpsTab"
        component={MyHelpsScreen}
        options={{
          title: 'My Helps',
          tabBarIcon: ({ color, focused }) => (
            <Heart size={22} color={color} strokeWidth={focused ? 2.5 : 1.8} />
          ),
        }}
      />
      <Tab.Screen
        name="ReportTab"
        component={ReportCategoryScreen}
        options={{
          title: '',
          tabBarAccessibilityLabel: 'Report a help request',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.fab, focused && styles.fabActive]}>
              <Plus size={26} color={colors.textOnTint} strokeWidth={2.5} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="AlertsTab"
        component={AlertsScreen}
        options={{
          title: 'Alerts',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger },
          tabBarIcon: ({ color, focused }) => (
            <Bell size={22} color={color} strokeWidth={focused ? 2.5 : 1.8} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <User size={22} color={color} strokeWidth={focused ? 2.5 : 1.8} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    fab: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primaryGreen,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 14,
      shadowColor: colors.primaryGreen,
      shadowOpacity: 0.45,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    fabActive: { backgroundColor: COLORS.accentStrong, shadowOpacity: 0.55 },
  });
