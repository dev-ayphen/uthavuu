import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '../theme/tokens';

type Shape = 'rounded' | 'pill';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  // Shown while an async lookup driven by this field is in flight (the
  // Dashboard's location geocode). Suppresses the clear button so the two
  // never fight for the same slot.
  loading?: boolean;
  onSubmit?: () => void;
  autoFocus?: boolean;
  shape?: Shape;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// One search box for the whole app — Dashboard's location search, the
// category list's request search, and Support's FAQ/ticket search were three
// hand-rolled copies of the same row (magnifier + input + clear affordance)
// that had drifted to three different heights, radii, and icon sizes, and
// only one of which was accessible or clearable.
//
// The clear button is always present once there's text: losing it was the
// real bug in two of the three copies, since a search with no way back to
// the unfiltered list is a dead end on a phone.
export default function SearchField({
  value,
  onChangeText,
  placeholder,
  loading,
  onSubmit,
  autoFocus,
  shape = 'rounded',
  accessibilityLabel,
  style,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const resolvedPlaceholder = placeholder ?? t('search');
  const showClear = value.length > 0 && !loading;

  return (
    <View style={[styles.box, shape === 'pill' && styles.boxPill, style]}>
      <Search size={ICON_SIZE.sm} color={colors.textSecondary} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={resolvedPlaceholder}
        placeholderTextColor={colors.textSecondary}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel ?? resolvedPlaceholder}
      />
      {loading ? <ActivityIndicator size="small" color={colors.primaryGreen} /> : null}
      {showClear ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={t('clearSearch')}
          hitSlop={CLEAR_HIT_SLOP}
        >
          <X size={ICON_SIZE.sm} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// The clear glyph is deliberately small (it must not compete with the text),
// so it leans on hitSlop to reach a thumb-sized target.
const CLEAR_HIT_SLOP = { top: SPACING.sm, bottom: SPACING.sm, left: SPACING.sm, right: SPACING.sm };

const SEARCH_HEIGHT = 44;

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      height: SEARCH_HEIGHT,
      paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    boxPill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACING.md },
    input: { flex: 1, ...TYPE.subhead, color: colors.textPrimary },
  });
