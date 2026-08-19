import { useMemo } from 'react';
import { StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { SPACING, TYPE } from '../theme/tokens';

type Props = {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

// One label+Switch row for the whole app (Profile Setup's "show profession"
// toggle, the report flow's privacy toggles) instead of each screen
// re-declaring the same row layout.
export default function ToggleRow({ label, subtitle, value, onValueChange, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, style]}>
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primaryGreen }}
        thumbColor={colors.textOnTint}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    textCol: { flex: 1, marginRight: SPACING.sm },
    label: { ...TYPE.subhead, color: colors.textPrimary },
    subtitle: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2 },
  });
