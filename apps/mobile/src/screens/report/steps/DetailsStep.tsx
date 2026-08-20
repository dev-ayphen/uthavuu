import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import TextField from '@uthavu/libs-mobile/components/TextField';
import ToggleRow from '@uthavu/libs-mobile/components/ToggleRow';
import Stepper from '@uthavu/libs-mobile/components/Stepper';

type Props = {
  title: string;
  description: string;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  neededVolunteers: number;
  onChangeNeededVolunteers: (value: number) => void;
};

export default function DetailsStep({
  title,
  description,
  onChangeTitle,
  onChangeDescription,
  neededVolunteers,
  onChangeNeededVolunteers,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('report');
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>{t('details.title')}</Text>
      <Text style={styles.subtitle}>{t('details.subtitle')}</Text>

      <TextField
        value={title}
        onChangeText={onChangeTitle}
        placeholder={t('details.titlePlaceholder')}
        autoCapitalize="sentences"
        autoFocus
        accessibilityLabel={t('details.titleLabel')}
      />
      <TextField
        value={description}
        onChangeText={onChangeDescription}
        placeholder={t('details.descriptionPlaceholder')}
        autoCapitalize="sentences"
        multiline
        accessibilityLabel={t('details.descriptionLabel')}
        style={styles.field}
      />

      <ToggleRow
        label={t('details.needsTeamLabel')}
        value={neededVolunteers > 1}
        onValueChange={(needsTeam) => onChangeNeededVolunteers(needsTeam ? 2 : 1)}
        style={styles.field}
      />
      {neededVolunteers > 1 && (
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>{t('details.volunteersNeededLabel')}</Text>
          <Stepper value={neededVolunteers} min={2} max={20} onChange={onChangeNeededVolunteers} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    field: { marginTop: SPACING.sm },
    stepperRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.md,
    },
    stepperLabel: { ...TYPE.subhead, color: colors.textPrimary },
  });
