import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { RADIUS, SIZES, SPACING } from '../../theme/tokens';
import Skeleton from '../../components/Skeleton';

// Mirrors RequestDetailsScreen's real layout (photo, category label, title,
// description lines, location, reporter row, roster card) so the initial
// load doesn't jump when real content replaces it.
export default function RequestDetailsSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.root}>
      <Skeleton width="100%" height={220} borderRadius={0} />
      <View style={styles.content}>
        <Skeleton width={100} height={11} />
        <Skeleton width="80%" height={20} style={styles.title} />
        <Skeleton width="100%" height={13} style={styles.line} />
        <Skeleton width="60%" height={13} style={styles.line} />
        <Skeleton width={160} height={13} style={styles.location} />

        <View style={styles.reporterRow}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <Skeleton width={120} height={13} />
        </View>

        <Skeleton width="100%" height={110} borderRadius={RADIUS.lg} style={styles.card} />
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: SIZES.padding },
    title: { marginTop: SPACING.xs, marginBottom: SPACING.xs },
    line: { marginBottom: SPACING.xs },
    location: { marginBottom: SPACING.md },
    reporterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.lg },
    card: { marginTop: SPACING.md },
  });
