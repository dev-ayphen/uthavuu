import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { COLORS, SPACING } from '../theme/tokens';

type Orientation = 'horizontal' | 'vertical';
type Tone = 'default' | 'onTint';

type Props = {
  orientation?: Orientation;
  // Vertical dividers need an explicit length (they sit inside a row with no
  // intrinsic height to stretch to); horizontal ones span their parent.
  length?: number;
  // Inset the rule from the edges of its container — the "hairline that stops
  // short of the card border" treatment used by Settings/Profile/Support rows.
  inset?: number;
  // Breathing room along the axis the divider separates.
  spacing?: number;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
};

// One hairline rule for the whole app. Every card divider, menu separator,
// FAQ separator, and vertical stat separator renders this instead of its own
// `{ height: 1, backgroundColor: colors.border }` copy — there were 22 such
// copies across 9 screens before this existed, each re-deciding its own
// margins. `tone="onTint"` is for a divider sitting on a solid colored
// surface (the Dashboard's dark header stat row), where `colors.border` would
// be invisible.
export default function Divider({
  orientation = 'horizontal',
  length,
  inset,
  spacing,
  tone = 'default',
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isVertical = orientation === 'vertical';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        isVertical ? styles.vertical : styles.horizontal,
        tone === 'onTint' && styles.onTint,
        isVertical
          ? {
              height: length ?? DEFAULT_VERTICAL_LENGTH,
              marginHorizontal: spacing,
              marginVertical: inset,
            }
          : {
              marginVertical: spacing,
              marginHorizontal: inset,
            },
        style,
      ]}
    />
  );
}

const DEFAULT_VERTICAL_LENGTH = SPACING.lg;

// Deliberately 1pt, not StyleSheet.hairlineWidth. Every one of the 22 inline
// copies this replaces used `height: 1`, and consolidating them shouldn't
// silently restyle the app — hairlineWidth renders at 0.5pt on 2x screens,
// which is a visible change. Switching to a true hairline is a design-system
// decision to make deliberately in docs/design/design-system.md, not a side
// effect of extracting a component.
const HAIRLINE = 1;

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    horizontal: { height: HAIRLINE, alignSelf: 'stretch', backgroundColor: colors.border },
    vertical: { width: HAIRLINE, backgroundColor: colors.border },
    onTint: { backgroundColor: COLORS.dividerOnTint },
  });
