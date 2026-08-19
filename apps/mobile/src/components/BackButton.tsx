import { StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, TOUCH_TARGET } from '../theme/tokens';

type Props = {
  onPress?: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

// One back button for the whole app — every screen that needs one renders this
// instead of its own ad-hoc TouchableOpacity+ChevronLeft, so position, icon
// size, and touch target stay identical everywhere (product owner: "the back
// button want to come across the mobile app - use the same component").
// Defaults to `navigation.goBack()` so most call sites need no props at all.
export default function BackButton({ onPress, color, style }: Props) {
  const { colors } = useTheme();
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      style={[styles.hitBox, style]}
      onPress={onPress ?? (() => navigation.goBack())}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <ChevronLeft size={ICON_SIZE.lg} color={color ?? colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hitBox: {
    width: TOUCH_TARGET.min,
    height: TOUCH_TARGET.min,
    marginLeft: -10,
    justifyContent: 'center',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
});
