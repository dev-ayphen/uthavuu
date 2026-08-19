import { useMemo } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { User } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';

type Tone = 'brand' | 'inverse';

type Props = {
  uri?: string | null;
  label?: string;
  size?: number;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
};

// One avatar for the whole app — photo when there is one, else the person's
// initial on a tinted circle (never a broken image or a fake photo), same as
// every mainstream app's fallback pattern. `tone` covers the two real
// contexts this app has: sitting on a light card (brand) or on the dark
// dashboard header (inverse).
export default function Avatar({ uri, label, size = 40, tone = 'brand', style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, tone), [colors, tone]);
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  const initial = label?.trim()?.[0]?.toUpperCase();

  if (uri) {
    return (
      <Image source={{ uri }} style={[styles.circle, dimension, style] as StyleProp<ImageStyle>} />
    );
  }

  return (
    <View style={[styles.circle, styles.fallback, dimension, style]}>
      {initial ? (
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
      ) : (
        <User size={size * 0.5} color={styles.initial.color} />
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme, tone: Tone) =>
  StyleSheet.create({
    circle: { overflow: 'hidden' },
    fallback: {
      backgroundColor: tone === 'brand' ? colors.primaryGreenLight : 'rgba(255,255,255,0.25)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: tone === 'inverse' ? 2 : 0,
      borderColor: 'rgba(255,255,255,0.5)',
    },
    initial: { fontWeight: '700', color: tone === 'brand' ? colors.primaryGreen : colors.textOnTint },
  });
