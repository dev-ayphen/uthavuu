import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Bell, Check, Lock, MapPin, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { reverseGeocode } from '../lib/geocode';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

// docs/mobile/05-permissions-screen.md gap #1 (the most consequential gap in the auth
// flow): the documented prototype never calls the OS at all — toggles are decorative.
// Fixed here — real permission requests, and per docs/features/auth.md BR-3, location
// is mandatory to finish signup (no "Skip" that bypasses it).
export default function PermissionsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [notifRequesting, setNotifRequesting] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    (async () => {
      const loc = await Location.getForegroundPermissionsAsync();
      setLocationGranted(loc.status === 'granted');
      const notif = await Notifications.getPermissionsAsync();
      setNotificationsGranted(notif.status === 'granted');
    })();
  }, []);

  const requestLocation = async () => {
    setRequesting(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
      if (status !== 'granted' && !canAskAgain) {
        Alert.alert(
          'Location needed',
          'Uthavu needs your location to show help requests near you. Enable it in Settings to continue.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } finally {
      setRequesting(false);
    }
  };

  const requestNotifications = async () => {
    setNotifRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsGranted(status === 'granted');
    } finally {
      setNotifRequesting(false);
    }
  };

  const onContinue = async () => {
    if (!locationGranted) return;
    setLocating(true);
    try {
      const position = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lng } = position.coords;
      const { city, district } = await reverseGeocode(lat, lng);
      navigation.replace('ProfileSetup', { lat, lng, city, district });
    } catch {
      Alert.alert('Could not get your location', 'Please try again.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.iconCircle}>
        <ShieldCheck size={ICON_SIZE.xl} color={colors.primaryGreen} />
      </View>
      <Text style={styles.title}>App Permissions</Text>
      <Text style={styles.subtitle}>
        Enable permissions to view nearby emergency help requests and get alerted when someone
        needs you.
      </Text>

      <TouchableOpacity
        style={[styles.row, locationGranted && styles.rowActive]}
        onPress={requestLocation}
        disabled={locationGranted || requesting}
        accessibilityRole="switch"
        accessibilityState={{ checked: locationGranted }}
      >
        <View style={[styles.iconBox, locationGranted && styles.iconBoxTintOn]}>
          <MapPin size={ICON_SIZE.md} color={locationGranted ? colors.primaryGreen : colors.textSecondary} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Location Access</Text>
          <Text style={styles.rowSubtitle}>Required to discover emergency help near you.</Text>
        </View>
        {requesting ? (
          <ActivityIndicator size="small" color={colors.primaryGreen} />
        ) : (
          <View style={[styles.checkCircle, locationGranted && styles.checkCircleOn]}>
            {locationGranted && <Check size={ICON_SIZE.xs} color={colors.textOnTint} strokeWidth={3} />}
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.row, notificationsGranted && styles.rowActive]}
        onPress={requestNotifications}
        disabled={notificationsGranted || notifRequesting}
        accessibilityRole="switch"
        accessibilityState={{ checked: notificationsGranted }}
      >
        <View style={[styles.iconBox, notificationsGranted && styles.iconBoxTintOn]}>
          <Bell size={ICON_SIZE.md} color={notificationsGranted ? colors.primaryGreen : colors.textSecondary} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Push Notifications</Text>
          <Text style={styles.rowSubtitle}>Alerts you when someone accepts your report.</Text>
        </View>
        {notifRequesting ? (
          <ActivityIndicator size="small" color={colors.primaryGreen} />
        ) : (
          <View style={[styles.checkCircle, notificationsGranted && styles.checkCircleOn]}>
            {notificationsGranted && <Check size={ICON_SIZE.xs} color={colors.textOnTint} strokeWidth={3} />}
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.privacyRow}>
        <Lock size={ICON_SIZE.xs} color={colors.textSecondary} />
        <Text style={styles.privacyText}>
          Your location is only used while actively responding to or creating reports.
        </Text>
      </View>

      <Button
        label="Continue"
        onPress={onContinue}
        disabled={!locationGranted}
        loading={locating}
        style={styles.continueButton}
      />
      {!locationGranted && (
        <Text style={styles.blockedNote}>Location access is required to continue.</Text>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: {
      padding: SPACING.xl,
      paddingTop: insets.top + SPACING.xl,
      paddingBottom: insets.bottom + SPACING.xl,
      alignItems: 'center',
    },
    iconCircle: {
      width: 54,
      height: 54,
      borderRadius: RADIUS.round,
      backgroundColor: colors.primaryGreenLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs + 2 },
    subtitle: {
      ...TYPE.body,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: SPACING.xs,
      marginBottom: SPACING.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      padding: SPACING.sm + 2,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      gap: SPACING.sm,
      marginBottom: SPACING.xs + 2,
    },
    rowActive: { borderColor: colors.primaryGreen },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconBoxTintOn: { backgroundColor: colors.primaryGreenLight },
    rowText: { flex: 1 },
    rowTitle: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: 2 },
    rowSubtitle: { ...TYPE.caption, color: colors.textSecondary, lineHeight: 15 },
    checkCircle: {
      width: 20,
      height: 20,
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    checkCircleOn: {
      backgroundColor: colors.primaryGreen,
      borderColor: colors.primaryGreen,
      justifyContent: 'center',
      alignItems: 'center',
    },
    privacyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs - 2, marginVertical: SPACING.md },
    privacyText: { ...TYPE.caption, color: colors.textSecondary, flexShrink: 1 },
    continueButton: { width: '100%' },
    blockedNote: { ...TYPE.footnoteRegular, color: colors.textSecondary, marginTop: SPACING.xs + 2 },
  });
