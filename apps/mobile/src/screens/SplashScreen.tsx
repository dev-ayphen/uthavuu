import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { HeartHandshake } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { hasSession, hasSeenOnboarding, clearAllForTesting } from '@uthavu/libs-mobile/lib/session';
import { getMe } from '@uthavu/libs-mobile/api/users';
import { isProfileIncomplete } from '@uthavu/libs-mobile/api/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

// docs/mobile/01-splash-screen.md gap #2/#3: the documented prototype always routes to
// Onboarding on a fixed 2000ms timer, even for a returning user with a stored session.
// Fixed here — route by real session/onboarding state, with a short minimum display so
// the brand isn't a one-frame flash on a fast device.
const MIN_DISPLAY_MS = 800;

// docs/features/impact-story.md US-4 — a shared uthavu://requests/:id link
// (or, in Expo Go, exp://host:port/--/requests/:id) must land the signed-in
// recipient directly on that report, not on Home. Only one deep-linkable
// route exists today, so a small targeted regex is simpler and clearer than
// pulling in React Navigation's generic getStateFromPath() resolution for a
// single case — revisit if a second deep-linkable route is ever added.
function extractDeepLinkReportId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/requests\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function SplashScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(insets), [insets]);
  const [resetting, setResetting] = useState(false);
  const { t } = useTranslation('auth');

  useEffect(() => {
    if (resetting) return; // long-press reset in progress — don't race it with routing
    let cancelled = false;

    async function route() {
      const [sessionExists, onboardingSeen, initialUrl] = await Promise.all([
        hasSession(),
        hasSeenOnboarding(),
        Linking.getInitialURL(),
        new Promise((resolve) => setTimeout(resolve, MIN_DISPLAY_MS)),
      ]);

      if (cancelled) return;

      if (sessionExists) {
        const reportId = extractDeepLinkReportId(initialUrl);
        if (reportId) {
          navigation.replace('RequestDetails', { reportId });
          return;
        }
        /*
         * A stored token is not the same thing as a finished signup. Better
         * Auth mints a session at OTP verification, before Permissions and
         * ProfileSetup have run — so someone who abandoned signup at that point
         * has a valid token, no location, and was being dropped straight onto
         * the Home tab. There they got a feed that could not query, permanently.
         * OtpScreen already gates on this; the resume path did not.
         *
         * A failed lookup falls through to MainTabs rather than trapping an
         * offline user on the permissions screen: being unable to reach the API
         * is not evidence that the profile is incomplete.
         */
        try {
          const me = await getMe();
          if (cancelled) return;
          if (isProfileIncomplete(me)) {
            navigation.replace('Permissions');
            return;
          }
        } catch {
          // Offline or API down — route as before.
        }
        if (cancelled) return;
        navigation.replace('MainTabs');
      } else if (onboardingSeen) {
        navigation.replace('Login');
      } else {
        navigation.replace('Onboarding');
      }
    }

    route();
    return () => {
      cancelled = true;
    };
  }, [navigation, resetting]);

  // Dev-only: long-press the brand mark to clear session + onboarding-seen and
  // force Onboarding. iOS Keychain (what expo-secure-store uses) often survives
  // a plain app reinstall, so this is the only reliable reset during testing.
  // __DEV__ means this is stripped from any production build — which is also
  // why the two strings below are deliberately NOT in the catalogue: no user
  // ever sees them, and translating a developer tool costs a real translator's
  // time for nothing. Leave them in English.
  const onLongPressReset = __DEV__
    ? async () => {
        setResetting(true);
        await clearAllForTesting();
        Alert.alert('Reset for testing', 'Session and onboarding state cleared.', [
          { text: 'OK', onPress: () => navigation.replace('Onboarding') },
        ]);
      }
    : undefined;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onLongPress={onLongPressReset}
      delayLongPress={1500}
    >
      <View style={styles.centerContent}>
        <HeartHandshake size={80} color={COLORS.bgWhite} strokeWidth={1.5} />
        <Text style={styles.title}>உதவு</Text>
      </View>
      <View style={styles.bottomContent}>
        <Text style={styles.tagline}>{t('splashTagline')}</Text>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.primaryGreen,
      justifyContent: 'center',
      alignItems: 'center',
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      ...TYPE.brandTitle,
      marginTop: SPACING.md,
      color: COLORS.bgWhite,
    },
    bottomContent: {
      position: 'absolute',
      bottom: insets.bottom + SPACING.xxl,
    },
    tagline: {
      ...TYPE.subhead,
      color: COLORS.whiteMuted,
    },
  });
