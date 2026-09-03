import { useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../theme/tokens';

// 'compact' — a single-line boxed field with an optional leading icon, fixed
//   48pt height. The auth-era treatment (Login's phone field, Profile Setup).
// 'form'    — the taller, label-led field used by every real form in the app
//   (report flow, edit report, submit ticket). Grows for multiline.
type Size = 'compact' | 'form';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  // Renders the field's label, the required marker, and the character counter
  // as one unit, so a form can't end up with a label styled differently from
  // the field below it.
  label?: string;
  required?: boolean;
  helper?: string;
  icon?: ReactNode;
  error?: string;
  maxLength?: number;
  // Shows "current/max" beside the label. Requires maxLength.
  showCounter?: boolean;
  size?: Size;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoFocus?: boolean;
  editable?: boolean;
  multiline?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

// One text input for the whole app — same box height, radius, border, and
// error-text treatment everywhere a field is collected.
//
// The label/required/counter/helper block is part of this component rather
// than something each screen re-lays-out above its own TextInput, which is
// how the four form screens ended up with four slightly different label
// styles and only one of them wiring the label to the input for screen
// readers.
export default function TextField({
  value,
  onChangeText,
  placeholder,
  label,
  required,
  helper,
  icon,
  error,
  maxLength,
  showCounter,
  size = 'compact',
  keyboardType,
  returnKeyType,
  onSubmitEditing,
  autoCapitalize,
  autoFocus,
  editable = true,
  multiline,
  accessibilityLabel,
  style,
  inputStyle,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isForm = size === 'form';
  const counter =
    showCounter && maxLength != null ? t('charCount', { current: value.length, max: maxLength }) : null;

  // Screen readers should hear the field's name, not its placeholder, and
  // should be told when it's required.
  const resolvedA11yLabel =
    accessibilityLabel ?? (label ? (required ? `${label}, ${t('requiredField')}` : label) : placeholder);

  const input = (
    <TextInput
      style={[
        isForm ? styles.formInput : styles.compactInput,
        multiline && (isForm ? styles.formTextArea : styles.compactInputMultiline),
        isForm && !editable && styles.inputDisabled,
        isForm && Boolean(error) && styles.inputError,
        inputStyle,
      ]}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      autoCapitalize={autoCapitalize}
      autoFocus={autoFocus}
      editable={editable}
      multiline={multiline}
      maxLength={maxLength}
      textAlignVertical={multiline ? 'top' : undefined}
      accessibilityLabel={resolvedA11yLabel}
    />
  );

  return (
    <View style={style}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {label}
            {required ? <Text style={styles.required}> *</Text> : null}
          </Text>
          {counter ? <Text style={styles.counter}>{counter}</Text> : null}
        </View>
      ) : null}

      {/* The compact size wraps its input in a bordered box so a leading icon
          can sit inside the border; the form size borders the input itself. */}
      {isForm ? (
        input
      ) : (
        <View style={[styles.box, multiline && styles.boxMultiline, !editable && styles.boxDisabled]}>
          {icon}
          {input}
        </View>
      )}

      {helper && !error ? <Text style={styles.helper}>{helper}</Text> : null}
      {error ? <Text style={isForm ? styles.errorForm : styles.errorCompact}>{error}</Text> : null}
    </View>
  );
}

const FORM_TEXT_AREA_HEIGHT = 90;

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    labelRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    label: { ...TYPE.subheadStrong, color: colors.textPrimary },
    required: { color: colors.danger },
    counter: { ...TYPE.caption, color: colors.textSecondary },

    // compact
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
    compactInput: { flex: 1, ...TYPE.headline, color: colors.textPrimary },
    compactInputMultiline: { textAlignVertical: 'top' },

    // form
    formInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      ...TYPE.body,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
    },
    formTextArea: { height: FORM_TEXT_AREA_HEIGHT, textAlignVertical: 'top' },
    inputDisabled: { opacity: 0.6 },
    inputError: { borderColor: colors.danger },

    helper: { ...TYPE.caption, color: colors.textSecondary, marginTop: SPACING.xxs, lineHeight: 16 },
    // The two sizes have always shown errors differently and both are in use:
    // the compact field's body-sized message (Login, Profile Setup) and the
    // form field's caption-sized one (Submit Ticket). Neither is changed here.
    errorCompact: { ...TYPE.body, color: colors.danger, marginTop: SPACING.xs },
    errorForm: { ...TYPE.caption, color: colors.danger, marginTop: SPACING.xxs },
  });
