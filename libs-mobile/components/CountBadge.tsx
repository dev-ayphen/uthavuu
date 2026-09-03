import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { RADIUS, SPACING, TONES, TYPE } from '../theme/tokens';
import type { Tone, ToneKey } from './StatusBadge';

type Props = {
  count: number | string;
  tone?: ToneKey | Tone;
  // Rendered before the number — the Dashboard's "• 4".
  prefix?: string;
  style?: StyleProp<ViewStyle>;
  // See StatusBadge — type-only escape hatch, colour still comes from the tone.
  labelStyle?: StyleProp<TextStyle>;
};

// A numeric count bubble. Distinct from StatusBadge despite looking similar:
// it centers a number in a minimum-width circle-ish pill rather than
// shrink-wrapping a word, so single and double digit counts don't jitter in
// width as the number changes.
export default function CountBadge({ count, tone = 'critical', prefix, style, labelStyle }: Props) {
  const resolved: Tone = typeof tone === 'string' ? TONES[tone] : tone;
  const styles = useMemo(() => createStyles(), []);

  return (
    <View style={[styles.badge, { backgroundColor: resolved.fill, borderColor: resolved.border }, style]}>
      <Text style={[styles.text, { color: resolved.fg }, labelStyle]}>
        {prefix ? `${prefix} ` : ''}
        {count}
      </Text>
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    badge: {
      minWidth: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
    },
    text: { ...TYPE.microLabel, fontWeight: '700' },
  });
