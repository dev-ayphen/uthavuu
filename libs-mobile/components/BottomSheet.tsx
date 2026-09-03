import { useMemo, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import CloseButton from './CloseButton';

type TitleAlign = 'left' | 'center';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  titleAlign?: TitleAlign;
  showHandle?: boolean;
  showCloseButton?: boolean;
  // A submit sheet shouldn't vanish because a thumb grazed the dim area —
  // Complete Mission opts out.
  dismissOnBackdropPress?: boolean;
  // Wrap the body in a ScrollView. Needed by any sheet whose content can grow
  // past the max height (category pickers, profession lists).
  scrollable?: boolean;
  // Sheets containing a text input must lift above the keyboard; two of the
  // sheets this replaces had an autoFocus input and no keyboard handling at
  // all, so the keyboard covered the thing you'd just focused.
  avoidKeyboard?: boolean;
  // Pinned action row below the body, outside the scroll area.
  footer?: ReactNode;
  // Safe-area bottom inset, so the sheet's last row clears the home
  // indicator / gesture bar. Passed in rather than read from
  // useSafeAreaInsets() because react-native-safe-area-context is a
  // dependency of apps/mobile, not of libs-mobile — screens here already
  // call the hook, so they hand the value down.
  bottomInset?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// One bottom sheet for the whole app.
//
// This replaces seven hand-rolled Modal+scrim+sheet stacks that had drifted
// apart on every axis that matters: two scrim alphas, two corner radii, three
// bottom paddings, and three different attempts at the tap-swallow guard —
// two of which were missing, so tapping the sheet's own padding dismissed it.
// That last one is a real bug, and it's fixed here for every caller at once:
// the body is always a tap-swallowing TouchableOpacity, so only the dim area
// outside the sheet dismisses.
//
// Bottom padding adds the caller-supplied safe-area inset on top of a base
// gap, rather than hardcoding the gesture-bar-sized guess the old copies
// were approximating with paddingBottom: SPACING.xxl / xxxl.
export default function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  titleAlign = 'left',
  showHandle = true,
  showCloseButton = false,
  dismissOnBackdropPress = true,
  scrollable = false,
  avoidKeyboard = false,
  footer,
  bottomInset = 0,
  children,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const hasHeader = Boolean(title) || showCloseButton;

  const body = scrollable ? (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    children
  );

  const sheet = (
    // activeOpacity={1} + no onPress is the tap-swallow guard: it stops presses
    // inside the sheet from reaching the backdrop below.
    <TouchableOpacity
      activeOpacity={1}
      style={[styles.sheet, { paddingBottom: bottomInset + SPACING.xxl }, style]}
    >
      {showHandle ? <View style={styles.handle} /> : null}

      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? (
              <Text
                style={[styles.title, titleAlign === 'center' && styles.titleCentered]}
                accessibilityRole="header"
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {showCloseButton ? <CloseButton onPress={onClose} /> : null}
        </View>
      ) : null}

      {body}
      {footer}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.scrim}
        activeOpacity={1}
        onPress={dismissOnBackdropPress ? onClose : undefined}
        // The backdrop is a dismiss affordance, not decoration — but only when
        // it actually dismisses.
        accessible={dismissOnBackdropPress}
        accessibilityRole={dismissOnBackdropPress ? 'button' : undefined}
      >
        {avoidKeyboard ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.pill,
      borderTopRightRadius: RADIUS.pill,
      padding: SPACING.lg,
      // Keeps a tall sheet from swallowing the whole screen; the old copies
      // had no bound at all, so a long list could push the handle off-screen.
      maxHeight: '85%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: SPACING.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.xs,
      marginBottom: SPACING.md,
    },
    headerText: { flex: 1 },
    title: { ...TYPE.screenTitle, color: colors.textPrimary },
    titleCentered: { textAlign: 'center' },
    subtitle: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2 },
  });
