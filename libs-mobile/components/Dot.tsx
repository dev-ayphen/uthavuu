import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { BORDER_WIDTH, COLORS, SPACING } from '../theme/tokens';

type Props = {
  color?: string;
  size?: number;
  // Hides the dot while keeping its space, so a list row doesn't reflow when
  // an item is marked read. This is what the Alerts unread indicator needs —
  // its inline copy achieved it by switching the fill to 'transparent'.
  visible?: boolean;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
};

// A small status dot — unread markers, live/active indicators, timeline rail
// nodes. Five hand-rolled copies of the same
// `{ width: n, height: n, borderRadius: n / 2 }` triangle preceded this.
//
// Deliberately does NOT cover the Onboarding pager dots: those animate their
// width to show position in a sequence, which is a different control that
// happens to be round.
export default function Dot({ color, size = DEFAULT_SIZE, visible = true, borderColor, style }: Props) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: visible ? (color ?? colors.primaryGreen) : COLORS.transparent,
        },
        borderColor ? { borderWidth: BORDER_WIDTH.thick, borderColor } : null,
        style,
      ]}
    />
  );
}

const DEFAULT_SIZE = SPACING.xs;
