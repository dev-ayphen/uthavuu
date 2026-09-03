import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { SPACING, TYPE } from '../theme/tokens';

type Variant = 'section' | 'overline';

type Props = {
  title: string;
  subtitle?: string;
  // Rendered opposite the title — a "See all" link, a count pill, a filter
  // button. Kept as a slot rather than a set of props so a call site can put
  // whatever it already has there without this component growing a prop per
  // use (the Dashboard puts a count pill here, Profile puts a link).
  action?: ReactNode;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
};

// One heading for every "block of content" boundary in the app.
//
// Two variants, because the app genuinely has two:
//   'section'  — a titled content block (Dashboard categories, Profile menu,
//                Support FAQ, the report flow's field groups). Reads as a
//                heading.
//   'overline' — the small uppercase label that sits above a grouped settings
//                card (Settings' APPEARANCE / LANGUAGE / NOTIFICATIONS).
//                Reads as a category marker, not a heading.
//
// Both carry accessibilityRole="header" so screen readers can jump between
// sections, which none of the ~10 inline copies did.
export default function SectionHeading({ title, subtitle, action, variant = 'section', style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const titleNode = (
    <Text style={variant === 'overline' ? styles.overline : styles.title} accessibilityRole="header">
      {title}
    </Text>
  );

  const blockStyle = variant === 'overline' ? styles.overlineBlock : styles.sectionBlock;

  // No action and no subtitle is the common case — render just the text so we
  // don't add a pointless wrapper View to the tree on most call sites.
  if (!action && !subtitle) {
    return <View style={[blockStyle, style]}>{titleNode}</View>;
  }

  return (
    <View style={[blockStyle, style]}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          {titleNode}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    sectionBlock: { marginTop: SPACING.sm, marginBottom: SPACING.xs },
    // Exactly the margins SettingsScreen's sectionLabel has always used.
    overlineBlock: { marginTop: SPACING.sm + 2, marginBottom: SPACING.xxs },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.xs },
    textCol: { flex: 1 },
    title: { ...TYPE.title, color: colors.textPrimary },
    overline: {
      ...TYPE.overline,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    subtitle: { ...TYPE.footnoteRegular, color: colors.textSecondary, marginTop: SPACING.xxs / 2 },
  });
