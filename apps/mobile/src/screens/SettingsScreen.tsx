import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, Check, Info, Laptop, Moon, Sun } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme, type ThemeMode } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import Button from '@uthavu/libs-mobile/components/Button';
import BackButton from '@uthavu/libs-mobile/components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'system', label: 'Use device setting', icon: Laptop },
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
];

export default function SettingsScreen(_props: Props) {
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);

  const [notifStatus, setNotifStatus] = useState<Notifications.PermissionStatus | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((res) => setNotifStatus(res.status));
  }, []);

  const notifGranted = notifStatus === Notifications.PermissionStatus.GRANTED;
  const appVersion = Constants.expoConfig?.version ?? '—';
  const appName = Constants.expoConfig?.name ?? 'Uthavu';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BackButton style={styles.backButton} />
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.card}>
        {THEME_OPTIONS.map((option, index) => {
          const selected = mode === option.mode;
          const Icon = option.icon;
          return (
            <TouchableOpacity
              key={option.mode}
              style={[styles.row, index < THEME_OPTIONS.length - 1 && styles.rowDivider]}
              onPress={() => setMode(option.mode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
            >
              <View style={styles.iconBox}>
                <Icon size={ICON_SIZE.md} color={selected ? colors.primaryGreen : colors.textSecondary} />
              </View>
              <Text style={styles.rowText}>{option.label}</Text>
              {selected && <Check size={ICON_SIZE.sm} color={colors.primaryGreen} strokeWidth={3} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Notifications</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Bell size={ICON_SIZE.md} color={notifGranted ? colors.primaryGreen : colors.textSecondary} />
          </View>
          <View style={styles.rowTextGroup}>
            <Text style={styles.rowText}>Push notifications</Text>
            <Text style={styles.rowSubtext}>
              {notifStatus === null
                ? 'Checking…'
                : notifGranted
                  ? 'Enabled'
                  : 'Off — enable in your device settings'}
            </Text>
          </View>
          {!notifGranted && notifStatus !== null && (
            <Button
              label="Open Settings"
              variant="secondary"
              onPress={() => Linking.openSettings()}
              style={styles.inlineButton}
            />
          )}
        </View>
      </View>

      <Text style={styles.sectionLabel}>About</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Info size={ICON_SIZE.md} color={colors.textSecondary} />
          </View>
          <View style={styles.rowTextGroup}>
            <Text style={styles.rowText}>{appName}</Text>
            <Text style={styles.rowSubtext}>Version {appVersion}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: {
      padding: SPACING.xl,
      paddingTop: insets.top + SPACING.md,
      paddingBottom: insets.bottom + SPACING.xl,
    },
    backButton: { marginBottom: SPACING.sm },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.lg },
    sectionLabel: {
      ...TYPE.footnote,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: SPACING.xs,
      marginTop: SPACING.lg,
    },
    card: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      padding: SPACING.sm + 2,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowText: { flex: 1, ...TYPE.subheadStrong, color: colors.textPrimary },
    rowTextGroup: { flex: 1 },
    rowSubtext: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2 },
    inlineButton: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
  });
