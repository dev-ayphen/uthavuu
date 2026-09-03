import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '../theme/tokens';

type Props = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

// A generic +/- numeric stepper — first used by the report flow's "how many
// volunteers do you need" field, but generic enough to reuse wherever a
// small bounded count needs editing.
export default function Stepper({ value, min, max, onChange }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.button, value <= min && styles.buttonDisabled]}
        onPress={() => value > min && onChange(value - 1)}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel={t('decrease')}
      >
        <Minus size={ICON_SIZE.sm} color={value <= min ? colors.disabled : colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.value}>{value}</Text>
      <TouchableOpacity
        style={[styles.button, value >= max && styles.buttonDisabled]}
        onPress={() => value < max && onChange(value + 1)}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={t('increase')}
      >
        <Plus size={ICON_SIZE.sm} color={value >= max ? colors.disabled : colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    button: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.5 },
    value: { ...TYPE.title, color: colors.textPrimary, minWidth: 28, textAlign: 'center' },
  });
