import { useMemo, type ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACING } from '../theme/tokens';

// 'default' — a padded content card (category tiles, grouped content blocks).
// 'group'   — a container for a list of ListRows, the iOS-Settings treatment.
//   No padding, so rows run full-bleed and their dividers reach both edges;
//   clipped corners so the first/last row can't spill past the radius.
type Variant = 'default' | 'group';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

// One bordered "box"/"section" container for the whole app — category tiles,
// grouped content blocks, anywhere a card-like surface is needed. Renders as
// a TouchableOpacity when `onPress` is given, a plain View otherwise.
export default function Card({ children, onPress, variant = 'default', style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const cardStyle = [variant === 'group' ? styles.group : styles.card, style];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.bg,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
    },
    group: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
  });
