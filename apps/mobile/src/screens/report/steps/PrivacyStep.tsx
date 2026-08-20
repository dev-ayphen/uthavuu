import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import ToggleRow from '@uthavu/libs-mobile/components/ToggleRow';

type Props = {
  anonymous: boolean;
  phoneVisible: boolean;
  onToggleAnonymous: (value: boolean) => void;
  onTogglePhoneVisible: (value: boolean) => void;
};

// docs/features/report-a-request.md US-4 — both default off, matching BR: a
// reporter opts INTO exposure, never the other way around.
export default function PrivacyStep({
  anonymous,
  phoneVisible,
  onToggleAnonymous,
  onTogglePhoneVisible,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('report');
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>{t('privacy.title')}</Text>
      <Text style={styles.subtitle}>{t('privacy.subtitle')}</Text>

      <ToggleRow
        label={t('privacy.anonymousLabel')}
        subtitle={t('privacy.anonymousSubtitle')}
        value={anonymous}
        onValueChange={onToggleAnonymous}
        style={styles.row}
      />
      <ToggleRow
        label={t('privacy.phoneVisibleLabel')}
        subtitle={t('privacy.phoneVisibleSubtitle')}
        value={phoneVisible}
        onValueChange={onTogglePhoneVisible}
        style={styles.row}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    row: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.sm + 2,
      marginBottom: SPACING.sm,
    },
  });
