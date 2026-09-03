import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, TOUCH_TARGET } from '../theme/tokens';

type Variant = 'circle' | 'bare';

type Props = {
  onPress: () => void;
  variant?: Variant;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// One dismiss control for every sheet and dialog in the app — the mirror of
// BackButton, and built the same way.
//
// The important part is the touch target. Of the eight hand-rolled close
// buttons this replaces, seven were between 14x14 and 28x28 — well under the
// 44pt floor that theme/tokens.ts TOUCH_TARGET declares, and which that
// token's own comment warns not to fake with hitSlop alone. So the pressable
// here is always TOUCH_TARGET.min, and the *visible* circle is a smaller box
// centered inside it. The button looks identical to the 28pt circle it
// replaces; it's just actually hittable now.
export default function CloseButton({ onPress, variant = 'circle', accessibilityLabel, style }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[styles.hitBox, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t('close')}
    >
      <View style={variant === 'circle' ? styles.circle : styles.bare}>
        <X size={ICON_SIZE.sm} color={colors.textSecondary} strokeWidth={2.5} />
      </View>
    </TouchableOpacity>
  );
}

const CIRCLE_SIZE = 28;

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    hitBox: {
      width: TOUCH_TARGET.min,
      height: TOUCH_TARGET.min,
      justifyContent: 'center',
      alignItems: 'center',
      // Pull the oversized target back so the *visible* circle still sits
      // flush with the sheet's padding edge, exactly where it did before.
      marginRight: -(TOUCH_TARGET.min - CIRCLE_SIZE) / 2,
    },
    circle: {
      width: CIRCLE_SIZE,
      height: CIRCLE_SIZE,
      borderRadius: CIRCLE_SIZE / 2,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bare: { justifyContent: 'center', alignItems: 'center' },
  });
