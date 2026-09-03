import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BORDER_WIDTH, RADIUS, SPACING, TONES, TYPE } from '../theme/tokens';

// A tone is the fg/fill/border triplet the whole app already uses to colour a
// status surface. Callers pass either a key from the TONES scale (the common
// case) or a computed triplet, for the handful of statuses whose colour comes
// from semantic theme colours rather than the fixed scale.
export type Tone = { fg: string; fill: string; border: string };
export type ToneKey = keyof typeof TONES;

type Size = 'sm' | 'md';
type Align = 'start' | 'inline';

type Props = {
  label: string;
  tone: ToneKey | Tone;
  // Slots rather than props-per-icon: the badges in this app variously lead
  // with a clock, a camera, a flag, a tick, or an avatar.
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: Size;
  // 'start' shrink-wraps the badge (the default — a badge should never
  // stretch to its parent's width). 'inline' drops that when the badge is
  // already a child of a row that positions it.
  align?: Align;
  style?: StyleProp<ViewStyle>;
  // Escape hatch for the label's type only — the colour still comes from the
  // tone. Several badges predate any shared type scale and render at 9.5/800
  // or 12/400 rather than the microLabel this component defaults to; they pass
  // their exact token here so adopting the component doesn't restyle them.
  // Container deltas (padding, gap, borderWidth) go through `style`.
  labelStyle?: StyleProp<TextStyle>;
};

// One status badge for the whole app — every pill that reports state.
//
// This absorbs two families that looked separate but aren't: the tone-driven
// status pills (urgency, ticket status, mission state) and the fixed-colour
// labels (category, "Verified", "LIVE", photo counters). They differ only in
// where the colour comes from, so `tone` accepts either a scale key or a
// literal triplet and one component covers both.
//
// Borderless badges pass `border: 'transparent'` in their tone rather than
// getting a `bordered` prop — the border is always drawn, so the geometry
// can't shift between bordered and borderless variants.
export default function StatusBadge({
  label,
  tone,
  leading,
  trailing,
  size = 'sm',
  align = 'start',
  style,
  labelStyle,
}: Props) {
  const resolved: Tone = typeof tone === 'string' ? TONES[tone] : tone;
  const styles = useMemo(() => createStyles(), []);

  // Preserves the guard TicketStatusPill had: an unresolved status label
  // should render nothing, not an empty coloured pill.
  if (!label) return null;

  return (
    <View
      style={[
        styles.badge,
        size === 'md' ? styles.badgeMd : styles.badgeSm,
        align === 'start' && styles.alignStart,
        { backgroundColor: resolved.fill, borderColor: resolved.border },
        style,
      ]}
    >
      {leading}
      <Text style={[size === 'md' ? styles.labelMd : styles.labelSm, { color: resolved.fg }, labelStyle]}>
        {label}
      </Text>
      {trailing}
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      borderWidth: BORDER_WIDTH.thin,
      borderRadius: RADIUS.pill,
    },
    alignStart: { alignSelf: 'flex-start' },
    badgeSm: { paddingHorizontal: SPACING.xs, paddingVertical: 2 },
    badgeMd: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xxs },
    labelSm: { ...TYPE.microLabel },
    labelMd: { ...TYPE.footnote },
  });
