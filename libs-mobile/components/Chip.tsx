import { useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../theme/tokens';

type Size = 'sm' | 'md';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  // Leading slot for the emoji/icon that several call sites were previously
  // concatenating into the label string, where a screen reader read it aloud
  // as part of the name.
  leading?: ReactNode;
  count?: number;
  disabled?: boolean;
  // 'sm' — a wrapping row of filter/category chips.
  // 'md' — a fixed-height chip in a grid or preset row.
  size?: Size;
  // Stretch to share a row equally (grid cells and preset rows).
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  // Type-only escape hatches, for the chips whose label token differs from
  // this component's default. Geometry deltas go through `style`.
  labelStyle?: StyleProp<TextStyle>;
  selectedLabelStyle?: StyleProp<TextStyle>;
};

// One selectable chip for the whole app — category pickers, status filters,
// urgency and duration presets, volunteer-count selectors.
//
// Seven hand-rolled copies of `[styles.chip, active && styles.chipActive]`
// preceded this. They are NOT all the same chip: they differ in corner radius
// (pill / md / lg / xl), padding, height, and text token. This component
// reproduces the dominant one exactly — Submit Ticket's and Support Home's
// filter chips — and a call site whose geometry differs should keep its own
// styling rather than be snapped to these defaults, because that would change
// what is on screen.
//
// Every chip reports `accessibilityState={{ selected }}`, which four of the
// seven originals omitted — without it a screen reader gives no signal about
// which filter is active. That is a semantics fix, not a visual one.
export default function Chip({
  label,
  selected,
  onPress,
  leading,
  count,
  disabled,
  size = 'sm',
  fill,
  style,
  labelStyle,
  selectedLabelStyle,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        size === 'md' ? styles.chipMd : styles.chipSm,
        fill && styles.chipFill,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
    >
      {leading}
      <Text style={[styles.label, labelStyle, selected && styles.labelSelected, selected && selectedLabelStyle]}>
        {label}
      </Text>
      {count != null ? (
        <View style={[styles.count, selected && styles.countSelected]}>
          <Text style={[styles.countText, selected && styles.countTextSelected]}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const CHIP_MD_HEIGHT = 40;

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xxs,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    chipSm: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
    chipMd: { height: CHIP_MD_HEIGHT, paddingHorizontal: SPACING.md },
    chipFill: { flex: 1 },
    chipSelected: { backgroundColor: colors.primaryGreenLight, borderColor: colors.primaryGreen },
    chipDisabled: { opacity: 0.5 },
    label: { ...TYPE.footnote, color: colors.textSecondary },
    labelSelected: { color: colors.primaryGreen },
    count: {
      minWidth: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.xxs,
      backgroundColor: colors.bg,
    },
    countSelected: { backgroundColor: colors.primaryGreen },
    countText: { ...TYPE.microLabel, color: colors.textSecondary, fontWeight: '700' },
    countTextSelected: { color: colors.textOnTint, fontWeight: '800' },
  });
