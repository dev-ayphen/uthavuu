import { useMemo, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TOUCH_TARGET, TYPE } from '../theme/tokens';

type Tone = 'default' | 'danger';

// The app has two row densities and they are not interchangeable:
//   'compact'     — the Settings treatment: 10pt gap/vertical padding, 13pt
//                   600-weight label, 10pt subtitle. Rows sit tight so a long
//                   settings list stays scannable.
//   'comfortable' — the Profile menu treatment: 16pt padding all round, 12pt
//                   gap, 14pt 700-weight label.
// Both values are exactly what those two screens already render.
type Density = 'compact' | 'comfortable';

type Props = {
  label: string;
  subtitle?: string;
  // Leading icon. Pass the rendered element so the call site keeps control of
  // which lucide glyph it wants; ListRow only owns the box around it.
  icon?: ReactNode;
  // Boxed icons are the Settings treatment (a tinted rounded square); the
  // Profile menu shows a bare glyph. Both exist in the app, so it's a variant.
  iconBoxed?: boolean;
  onPress?: () => void;
  // 'navigate' shows a chevron, 'select' shows a checkmark when selected.
  // A row with neither is a plain display row.
  accessory?: 'navigate' | 'select' | 'none';
  selected?: boolean;
  // Rendered in place of the built-in accessory — an inline button, a switch,
  // a value label.
  trailing?: ReactNode;
  tone?: Tone;
  density?: Density;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

// One tappable row for every grouped list in the app — Settings' theme /
// language / legal rows, the Profile menu's 7 navigation rows, Support's
// links. These were ~15 hand-rolled TouchableOpacity+icon+label+chevron
// copies across two screens, at two densities, and the Profile menu's copies
// carried no accessibility role at all.
//
// Both densities render exactly what their screens rendered before — this
// consolidates where the values live, it does not restyle either screen.
//
// Rows are meant to sit inside a <Card> with <Divider> between them; this
// component owns the row, not the group container, so a screen keeps control
// of where the dividers and insets go.
export default function ListRow({
  label,
  subtitle,
  icon,
  iconBoxed = false,
  onPress,
  accessory = 'none',
  selected = false,
  trailing,
  tone = 'default',
  density = 'compact',
  disabled,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const labelColor = tone === 'danger' ? colors.danger : colors.textPrimary;
  const isCompact = density === 'compact';
  const rowStyle = isCompact ? styles.rowCompact : styles.rowComfortable;

  const content = (
    <>
      {icon ? <View style={iconBoxed ? styles.iconBox : styles.iconBare}>{icon}</View> : null}
      <View style={styles.textCol}>
        <Text style={[isCompact ? styles.labelCompact : styles.labelComfortable, { color: labelColor }]}>
          {label}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {!trailing && accessory === 'navigate' ? (
        <ChevronRight size={ICON_SIZE.sm} color={labelColor === colors.danger ? colors.danger : colors.textSecondary} />
      ) : null}
      {!trailing && accessory === 'select' && selected ? (
        <Check size={ICON_SIZE.sm} color={colors.primaryGreen} strokeWidth={3} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[rowStyle, style]}>{content}</View>;
  }

  // A selectable row is a radio to a screen reader, not a button — that
  // distinction is what lets VoiceOver announce "selected" on the current
  // theme/language instead of reading seven identical "button"s.
  const role: AccessibilityRole = accessory === 'select' ? 'radio' : 'button';

  return (
    <TouchableOpacity
      style={[rowStyle, disabled && styles.rowDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={subtitle}
      accessibilityState={accessory === 'select' ? { selected, disabled } : { disabled }}
    >
      {content}
    </TouchableOpacity>
  );
}

const ICON_BOX_SIZE = 28;

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    rowCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs + 2,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs + 2,
      // Both densities already exceed this once their icon box is accounted
      // for, so it is a floor for icon-less rows, not a change to either.
      minHeight: TOUCH_TARGET.min,
    },
    rowComfortable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      padding: SPACING.md,
      minHeight: TOUCH_TARGET.min,
    },
    rowDisabled: { opacity: 0.5 },
    iconBox: {
      width: ICON_BOX_SIZE,
      height: ICON_BOX_SIZE,
      borderRadius: RADIUS.sm,
      backgroundColor: colors.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconBare: { justifyContent: 'center', alignItems: 'center' },
    textCol: { flex: 1 },
    labelCompact: { ...TYPE.footnote, fontSize: 13, fontWeight: '600' },
    labelComfortable: { ...TYPE.subheadStrong, fontSize: 14 },
    subtitle: { ...TYPE.microLabel, color: colors.textSecondary, marginTop: 1 },
  });
