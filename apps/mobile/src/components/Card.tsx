import { useMemo, type ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACING } from '../theme/tokens';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

// One bordered "box"/"section" container for the whole app — category tiles,
// grouped content blocks, anywhere a card-like surface is needed. Renders as
// a TouchableOpacity when `onPress` is given, a plain View otherwise.
export default function Card({ children, onPress, style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.card, style]}>{children}</View>;
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
  });
