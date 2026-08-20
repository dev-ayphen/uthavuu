import { useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../theme/tokens';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  icon?: ReactNode;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoFocus?: boolean;
  editable?: boolean;
  multiline?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// One text input for the whole app — same box height, radius, border, and
// error-text treatment everywhere a field is collected (Login's phone field,
// Profile Setup's optional fields, etc.).
export default function TextField({
  value,
  onChangeText,
  placeholder,
  icon,
  error,
  keyboardType,
  autoCapitalize,
  autoFocus,
  editable = true,
  multiline,
  accessibilityLabel,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={style}>
      <View style={[styles.box, multiline && styles.boxMultiline, !editable && styles.boxDisabled]}>
        {icon}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoFocus={autoFocus}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={accessibilityLabel ?? placeholder}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.sm + 2,
      gap: SPACING.xs,
    },
    boxMultiline: { height: undefined, minHeight: 88, paddingVertical: SPACING.xs, alignItems: 'flex-start' },
    boxDisabled: { opacity: 0.6 },
    input: { flex: 1, ...TYPE.headline, color: colors.textPrimary },
    inputMultiline: { textAlignVertical: 'top' },
    error: { ...TYPE.body, color: colors.danger, marginTop: SPACING.xs },
  });
