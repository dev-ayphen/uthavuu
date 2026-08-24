import { ActivityIndicator, type ColorValue } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Variant = 'standalone' | 'onTint';

type Props = {
  variant?: Variant;
  size?: 'small' | 'large';
};

// One spinner for the whole app — two legitimate variants, not one forced
// color: 'standalone' for a page-level/inline loading state (green, matches
// the app's primary tint), 'onTint' for a spinner rendered inside a solid
// green surface (a submitting button, a colored banner) where it needs to
// be light to stay visible. Every call site picks one of these two instead
// of independently deciding which raw color prop to pass.
export default function Spinner({ variant = 'standalone', size = 'small' }: Props) {
  const { colors } = useTheme();
  const color: ColorValue = variant === 'onTint' ? colors.textOnTint : colors.primaryGreen;
  return <ActivityIndicator size={size} color={color} />;
}
