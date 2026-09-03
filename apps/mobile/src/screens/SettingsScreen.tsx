import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bell, FileText, Info, Languages, Laptop, Moon, Sun, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getNotificationPermission,
  type PermissionState,
} from '@uthavu/libs-mobile/lib/notifications';
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
import { ICON_SIZE, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import {
  BackButton,
  Button,
  Card,
  Divider,
  ListRow,
  SectionHeading,
  ToggleRow,
} from '@uthavu/libs-mobile/components';
import { useConfig } from '../hooks/useConfig';

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
  const config = useConfig();

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

  const [notifStatus, setNotifStatus] = useState<PermissionState | null>(null);

  useEffect(() => {
    getNotificationPermission().then(setNotifStatus);
  }, []);

  const notifGranted = notifStatus === 'granted';
  const appVersion = Constants.expoConfig?.version ?? '—';
  const appName = Constants.expoConfig?.name ?? 'Uthavu';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BackButton style={styles.backButton} />
      <Text style={styles.title}>{t('settings.title')}</Text>

      <SectionHeading variant="overline" title={t('settings.appearance')} />
      <Card variant="group">
        {THEME_OPTIONS.map((option, index) => {
          const selected = mode === option.mode;
          const Icon = option.icon;
          const label = t(option.labelKey);
          return (
            <View key={option.mode}>
              <ListRow
                label={label}
                icon={
                  <Icon size={ICON_SIZE.md} color={selected ? colors.primaryGreen : colors.textSecondary} />
                }
                iconBoxed
                accessory="select"
                selected={selected}
                onPress={() => setMode(option.mode)}
              />
              {index < THEME_OPTIONS.length - 1 ? <Divider /> : null}
            </View>
          );
        })}
      </Card>

      <SectionHeading variant="overline" title={t('settings.language')} />
      <Card variant="group">
        {LANGUAGE_OPTIONS.map((option, index) => {
          const selected = locale === option.locale;
          return (
            <View key={option.locale}>
              <ListRow
                label={option.label}
                icon={
                  <Languages
                    size={ICON_SIZE.md}
                    color={selected ? colors.primaryGreen : colors.textSecondary}
                  />
                }
                iconBoxed
                accessory="select"
                selected={selected}
                onPress={() => onSelectLocale(option.locale)}
              />
              {index < LANGUAGE_OPTIONS.length - 1 ? <Divider /> : null}
            </View>
          );
        })}
      </Card>

      <SectionHeading variant="overline" title={t('settings.notifications')} />
      <Card variant="group">
        <ListRow
          label={t('settings.pushNotifications')}
          subtitle={
            notifStatus === null
              ? t('settings.notifChecking')
              : notifGranted
                ? t('settings.notifEnabled')
                : t('settings.notifDisabled')
          }
          icon={
            <Bell size={ICON_SIZE.md} color={notifGranted ? colors.primaryGreen : colors.textSecondary} />
          }
          iconBoxed
          trailing={
            !notifGranted && notifStatus !== null ? (
              <Button
                label={t('settings.openSettings')}
                variant="secondary"
                onPress={() => Linking.openSettings()}
                style={styles.inlineButton}
              />
            ) : undefined
          }
        />
      </Card>

      <SectionHeading variant="overline" title={t('settings.privacy')} />
      <Card variant="group">
        {/* Writes the same defaultAnonymous the report flow seeds its
            anonymity toggle from — so it follows the same platform switch.
            Showing it while GET /config forbids anonymous reports would be a
            preference that silently does nothing. */}
        {config.allowAnonymousReports && (
          <>
            <ToggleRow
              label={t('settings.privacyHideName')}
              subtitle={t('settings.privacyHideNameSubtitle')}
              value={me?.defaultAnonymous ?? false}
              onValueChange={(value) => privacyMutation.mutate({ defaultAnonymous: value })}
              style={styles.toggleRow}
            />
            <Divider />
          </>
        )}
        <ToggleRow
          label={t('settings.privacyHidePhone')}
          subtitle={t('settings.privacyHidePhoneSubtitle')}
          value={me?.defaultPhoneVisible === false}
          onValueChange={(value) => privacyMutation.mutate({ defaultPhoneVisible: !value })}
          style={styles.toggleRow}
        />
      </Card>

      <SectionHeading variant="overline" title={t('settings.legal')} />
      <Card variant="group">
        {LEGAL_TOPICS.map((item, index) => (
          <View key={item.topic}>
            <ListRow
              label={t(item.labelKey)}
              icon={<FileText size={ICON_SIZE.md} color={colors.textSecondary} />}
              iconBoxed
              accessory="navigate"
              onPress={() => navigation.navigate('Legal', { topic: item.topic })}
            />
            {index < LEGAL_TOPICS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <SectionHeading variant="overline" title={t('settings.account')} />
      <Card variant="group">
        <ListRow
          label={t('settings.deleteAccount')}
          icon={<Trash2 size={ICON_SIZE.md} color={colors.danger} />}
          iconBoxed
          tone="danger"
          accessory="navigate"
          onPress={() => navigation.navigate('DeleteAccount')}
        />
      </Card>

      <SectionHeading variant="overline" title={t('settings.about')} />
      <Card variant="group">
        <ListRow
          label={appName}
          subtitle={t('settings.version', { version: appVersion })}
          icon={<Info size={ICON_SIZE.md} color={colors.textSecondary} />}
          iconBoxed
        />
      </Card>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: {
      paddingHorizontal: SPACING.md,
      paddingTop: insets.top + SPACING.xs,
      paddingBottom: insets.bottom + SPACING.lg,
    },
    backButton: { marginBottom: SPACING.xs },
    title: { ...TYPE.headlineStrong, fontSize: 20, color: colors.textPrimary, marginBottom: SPACING.xs },
    inlineButton: { paddingVertical: 4, paddingHorizontal: SPACING.xs },
    toggleRow: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2 },
  });
