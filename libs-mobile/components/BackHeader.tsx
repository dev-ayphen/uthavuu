import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { SIZES, SPACING, TOUCH_TARGET, TYPE } from '../theme/tokens';
import BackButton from './BackButton';

type Props = {
  title: string;
  style?: StyleProp<ViewStyle>;
  // BackButton is TOUCH_TARGET.min wide — that's the value that actually
  // centers the title against it. Defaulted to match, but left overridable
  // since two existing screens (Saved Stories, Invite Friends) were built
  // with a narrower spacer (SPACING.xl) before this component existed;
  // pass their exact value on adoption so nothing shifts pixel-for-pixel.
  spacerWidth?: number;
};

// Shared stack-screen header: BackButton + centered title + a balancing
// spacer. Extracted from five screens (Volunteer Journey, Saved Stories,
// Invite Friends, My Impact Stories, Flagged Comments) that each hand-rolled
// this exact layout. Distinct from ScreenHeader.tsx, which is the
// tab-root header (title + badge + action pill, no back button) used by
// Alerts/My Helps — different shape, different job.
export default function BackHeader({ title, style, spacerWidth = TOUCH_TARGET.min }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.header, style]}>
      <BackButton />
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: spacerWidth }} />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SIZES.padding,
      paddingBottom: SPACING.sm,
    },
    headerTitle: { ...TYPE.screenTitle, color: colors.textPrimary },
  });
