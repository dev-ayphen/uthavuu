import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>Describe the situation</Text>
      <Text style={styles.subtitle}>Keep it short and specific — this is what people see first.</Text>

      <TextField
        value={title}
        onChangeText={onChangeTitle}
        placeholder="Title, e.g. 'Injured dog near the market'"
        autoCapitalize="sentences"
        autoFocus
        accessibilityLabel="Title"
      />
      <TextField
        value={description}
        onChangeText={onChangeDescription}
        placeholder="What's happening, and what kind of help is needed?"
        autoCapitalize="sentences"
        multiline
        accessibilityLabel="Description"
        style={styles.field}
      />

      <ToggleRow
        label="This needs more than one volunteer"
        value={neededVolunteers > 1}
        onValueChange={(needsTeam) => onChangeNeededVolunteers(needsTeam ? 2 : 1)}
        style={styles.field}
      />
      {neededVolunteers > 1 && (
        <View style={styles.stepperRow}>
          <Text style={styles.stepperLabel}>Volunteers needed</Text>
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
