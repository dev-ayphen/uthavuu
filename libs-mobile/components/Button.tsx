import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'dangerOutline' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// One button for the whole app — every primary/secondary/destructive action
// renders this instead of a bespoke TouchableOpacity+StyleSheet pair, so
// height, radius, and type are identical everywhere a button appears
// (product owner: "create component and use those ... across the app").
export default function Button({ label, onPress, variant = 'primary', disabled, loading, icon, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;

  const textColor =
    variant === 'primary'
      ? colors.textOnTint
      : variant === 'dangerOutline'
        ? colors.danger
        : variant === 'secondary'
          ? colors.textPrimary
          : colors.textSecondary;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        isDisabled && variant === 'primary' && styles.primaryDisabled,
        isDisabled && variant !== 'primary' && styles.otherDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.xs,
      borderRadius: RADIUS.pill,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
    },
    label: { ...TYPE.title },
    primary: { backgroundColor: colors.primaryGreen },
    secondary: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
    dangerOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
    ghost: { backgroundColor: 'transparent', paddingVertical: SPACING.sm },
    primaryDisabled: { backgroundColor: colors.disabled },
    otherDisabled: { opacity: 0.5 },
  });
