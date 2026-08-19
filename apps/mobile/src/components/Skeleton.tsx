import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS } from '../theme/tokens';

type Props = {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

const PULSE_DURATION_MS = 700;
const DIM_OPACITY = 0.5;
const LIT_OPACITY = 1;

// One shimmering placeholder block for the whole app — screens compose it
// into shapes that mimic their real layout (a photo-sized rect, narrower
// bars for text lines, a circle for an avatar) while real API data loads.
// Dependency-free: a pulsing-opacity loop via RN's own Animated API, no
// gradient library.
export default function Skeleton({ width = '100%', height = 16, borderRadius = RADIUS.sm, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(DIM_OPACITY)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: LIT_OPACITY, duration: PULSE_DURATION_MS, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: DIM_OPACITY, duration: PULSE_DURATION_MS, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, { width, height, borderRadius, opacity }, style]} />;
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    block: { backgroundColor: colors.border },
  });
