import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SIZES, SPACING, TYPE } from '../theme/tokens';
import type { ColorScheme } from '../theme/colors';

/**
 * Shared top-of-screen header — matches the Alerts screen header style:
 *   [Title]  [badge]              [right action pill]
 *
 * Used by AlertsScreen, MyHelpsScreen, and any future tab-level screens
 * so all pages share the same top-section visually.
 */
export interface ScreenHeaderProps {
  title: string;
  badge?: string | number;
  badgeColor?: string;
  badgeTextColor?: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  actionDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ScreenHeader({
  title,
  badge,
  badgeColor,
  badgeTextColor,
  actionLabel,
  actionIcon,
  onAction,
  actionDisabled,
  style,
}: ScreenHeaderProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const hasBadge = badge !== undefined && badge !== null && String(badge) !== '';
  const hasAction = !!(actionLabel || actionIcon);

  return (
    <View style={[styles.header, style]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {hasBadge && (
          <View style={[styles.badge, badgeColor ? { backgroundColor: badgeColor } : undefined]}>
            <Text style={[styles.badgeText, badgeTextColor ? { color: badgeTextColor } : undefined]}>
              {badge}
            </Text>
          </View>
        )}
      </View>

      {hasAction && (
        <TouchableOpacity
          style={[styles.actionPill, actionDisabled && styles.actionPillDisabled]}
          onPress={onAction}
          disabled={actionDisabled}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          {actionIcon}
          {actionLabel ? <Text style={styles.actionText}>{actionLabel}</Text> : null}
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SIZES.padding,
      marginBottom: SPACING.xs,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    title: {
      ...TYPE.pageTitle,
      color: colors.textPrimary,
    },
    badge: {
      backgroundColor: '#FEE2E2',
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs / 2,
      borderRadius: RADIUS.pill,
    },
    badgeText: {
      ...TYPE.microLabel,
      color: colors.danger,
    },
    actionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      backgroundColor: colors.primaryGreenLight,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xxs,
      borderRadius: RADIUS.pill,
    },
    actionPillDisabled: { opacity: 0.45 },
    actionText: {
      ...TYPE.footnote,
      color: colors.primaryGreen,
      fontWeight: '700',
    },
  });
