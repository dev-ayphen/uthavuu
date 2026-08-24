import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SIZES, SPACING, TYPE } from '../theme/tokens';

export type TabBarItem<K extends string = string> = {
  key: K;
  label: string;
};

type Props<K extends string> = {
  items: TabBarItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
  // Alerts' three (or more) filter tabs scroll horizontally; My Helps' two
  // tabs fill the row edge-to-edge instead — same pill visuals either way,
  // just a different container so a fixed two-tab row doesn't get squeezed
  // to fit a scroll viewport it doesn't need.
  scrollable?: boolean;
};

// Extracted from AlertsScreen's "All / Requests / Updates" filter pills —
// the one segmented-tab pattern this app already has in two places
// (Alerts, My Helps), now backed by one component instead of two
// hand-rolled copies.
export default function TabBar<K extends string>({ items, selected, onSelect, scrollable = false }: Props<K>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const pillStyle = scrollable ? styles.tabPill : styles.tabPillFixed;
  const tabs = items.map((item) => {
    const isSelected = item.key === selected;
    return (
      <TouchableOpacity
        key={item.key}
        style={[pillStyle, isSelected && styles.tabPillActive]}
        onPress={() => onSelect(item.key)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>{item.label}</Text>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <View style={styles.wrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
          {tabs}
        </ScrollView>
      </View>
    );
  }

  return <View style={styles.fixedRow}>{tabs}</View>;
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    wrapper: { marginBottom: SPACING.sm },
    scrollContainer: { paddingHorizontal: SIZES.padding, gap: SPACING.xs },
    fixedRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm },
    tabPill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabPillFixed: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabPillActive: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
    },
    tabText: {
      ...TYPE.footnote,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
  });
