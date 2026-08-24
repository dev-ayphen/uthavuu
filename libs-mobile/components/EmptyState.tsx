import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { SPACING, TYPE } from '../theme/tokens';

type Props = {
  icon: ReactNode;
  title: string;
  subtitle: string;
};

// Shared "nothing here yet" block for list screens — icon + title + subtitle,
// centered. Extracted from three screens (Saved Stories, My Impact Stories,
// Flagged Comments) that had byte-identical styling for this, differing only
// in icon/copy.
export default function EmptyState({ icon, title, subtitle }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.empty}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs, paddingHorizontal: SPACING.xl },
    emptyTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
