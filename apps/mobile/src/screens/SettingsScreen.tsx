import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, Check, ChevronRight, FileText, Info, Languages, Laptop, Moon, Sun, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme, type ThemeMode } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppLocale } from '@uthavu/libs-mobile/i18n/useAppLocale';
import type { AppLocale } from '@uthavu/libs-mobile/i18n';
import { getMe, updateLocale, updatePrivacyDefaults } from '@uthavu/libs-mobile/api/users';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import Button from '@uthavu/libs-mobile/components/Button';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import ToggleRow from '@uthavu/libs-mobile/components/ToggleRow';

const LEGAL_TOPICS: { topic: 'terms' | 'privacy' | 'guidelines'; labelKey: string }[] = [
  { topic: 'terms', labelKey: 'settings.legalTerms' },
  { topic: 'privacy', labelKey: 'settings.legalPrivacy' },
  { topic: 'guidelines', labelKey: 'settings.legalGuidelines' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const THEME_OPTIONS: { mode: ThemeMode; labelKey: string; icon: typeof Sun }[] = [
  { mode: 'system', labelKey: 'settings.themeSystem', icon: Laptop },
  { mode: 'light', labelKey: 'settings.themeLight', icon: Sun },
  { mode: 'dark', labelKey: 'settings.themeDark', icon: Moon },
];

const LANGUAGE_OPTIONS: { locale: AppLocale; label: string }[] = [
  { locale: 'en', label: 'English' },
  { locale: 'ta', label: 'தமிழ்' },
];

export default function SettingsScreen({ navigation }: Props) {
  const { colors, mode, setMode } = useTheme();
  const { locale, setLocale } = useAppLocale();
  const { t } = useTranslation('tabs');
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const queryClient = useQueryClient();

  // Best-effort — the in-app switch (setLocale) already succeeded
  // synchronously regardless of this outcome, see updateLocale()'s comment.
  const syncLocaleMutation = useMutation({ mutationFn: updateLocale });
  const onSelectLocale = (next: AppLocale) => {
    setLocale(next);
    syncLocaleMutation.mutate(next);
  };

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const privacyMutation = useMutation({
    mutationFn: updatePrivacyDefaults,
    onSuccess: (updated) => queryClient.setQueryData(['me'], updated),
  });

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
      <Text style={styles.title}>{t('settings.title')}</Text>

      <Text style={styles.sectionLabel}>{t('settings.appearance')}</Text>
      <View style={styles.card}>
        {THEME_OPTIONS.map((option, index) => {
          const selected = mode === option.mode;
          const Icon = option.icon;
          const label = t(option.labelKey);
          return (
            <TouchableOpacity
              key={option.mode}
              style={[styles.row, index < THEME_OPTIONS.length - 1 && styles.rowDivider]}
              onPress={() => setMode(option.mode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={label}
            >
              <View style={styles.iconBox}>
                <Icon size={ICON_SIZE.md} color={selected ? colors.primaryGreen : colors.textSecondary} />
              </View>
              <Text style={styles.rowText}>{label}</Text>
              {selected && <Check size={ICON_SIZE.sm} color={colors.primaryGreen} strokeWidth={3} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
      <View style={styles.card}>
        {LANGUAGE_OPTIONS.map((option, index) => {
          const selected = locale === option.locale;
          return (
            <TouchableOpacity
              key={option.locale}
              style={[styles.row, index < LANGUAGE_OPTIONS.length - 1 && styles.rowDivider]}
              onPress={() => onSelectLocale(option.locale)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
            >
              <View style={styles.iconBox}>
                <Languages size={ICON_SIZE.md} color={selected ? colors.primaryGreen : colors.textSecondary} />
              </View>
              <Text style={styles.rowText}>{option.label}</Text>
              {selected && <Check size={ICON_SIZE.sm} color={colors.primaryGreen} strokeWidth={3} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>{t('settings.notifications')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Bell size={ICON_SIZE.md} color={notifGranted ? colors.primaryGreen : colors.textSecondary} />
          </View>
          <View style={styles.rowTextGroup}>
            <Text style={styles.rowText}>{t('settings.pushNotifications')}</Text>
            <Text style={styles.rowSubtext}>
              {notifStatus === null
                ? t('settings.notifChecking')
                : notifGranted
                  ? t('settings.notifEnabled')
                  : t('settings.notifDisabled')}
            </Text>
          </View>
          {!notifGranted && notifStatus !== null && (
            <Button
              label={t('settings.openSettings')}
              variant="secondary"
              onPress={() => Linking.openSettings()}
              style={styles.inlineButton}
            />
          )}
        </View>
      </View>

      <Text style={styles.sectionLabel}>{t('settings.privacy')}</Text>
      <View style={styles.card}>
        <ToggleRow
          label={t('settings.privacyHideName')}
          subtitle={t('settings.privacyHideNameSubtitle')}
          value={me?.defaultAnonymous ?? false}
          onValueChange={(value) => privacyMutation.mutate({ defaultAnonymous: value })}
          style={styles.toggleRow}
        />
        <View style={styles.rowDivider} />
        <ToggleRow
          label={t('settings.privacyHidePhone')}
          subtitle={t('settings.privacyHidePhoneSubtitle')}
          value={me?.defaultPhoneVisible === false}
          onValueChange={(value) => privacyMutation.mutate({ defaultPhoneVisible: !value })}
          style={styles.toggleRow}
        />
      </View>

      <Text style={styles.sectionLabel}>{t('settings.legal')}</Text>
      <View style={styles.card}>
        {LEGAL_TOPICS.map((item, index) => (
          <TouchableOpacity
            key={item.topic}
            style={[styles.row, index < LEGAL_TOPICS.length - 1 && styles.rowDivider]}
            onPress={() => navigation.navigate('Legal', { topic: item.topic })}
            accessibilityRole="button"
          >
            <View style={styles.iconBox}>
              <FileText size={ICON_SIZE.md} color={colors.textSecondary} />
            </View>
            <Text style={styles.rowText}>{t(item.labelKey)}</Text>
            <ChevronRight size={ICON_SIZE.sm} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>{t('settings.account')}</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('DeleteAccount')}
          accessibilityRole="button"
        >
          <View style={styles.dangerIconBox}>
            <Trash2 size={ICON_SIZE.md} color={colors.danger} />
          </View>
          <Text style={[styles.rowText, { color: colors.danger }]}>{t('settings.deleteAccount')}</Text>
          <ChevronRight size={ICON_SIZE.sm} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>{t('settings.about')}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Info size={ICON_SIZE.md} color={colors.textSecondary} />
          </View>
          <View style={styles.rowTextGroup}>
            <Text style={styles.rowText}>{appName}</Text>
            <Text style={styles.rowSubtext}>{t('settings.version', { version: appVersion })}</Text>
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
    toggleRow: { paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.sm + 2 },
    dangerIconBox: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
