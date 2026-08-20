import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { SPACING, TYPE } from '../theme/tokens';

// Honest placeholder for tabs whose feature doc hasn't been built yet
// (report-a-request, alerts, my-helps). No fabricated data — see
// docs/README.md on why that matters for this project specifically.
export function ComingSoon({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Icon size={40} color={colors.textSecondary} strokeWidth={1.5} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xxl,
      gap: SPACING.xs,
    },
    title: { ...TYPE.screenTitle, color: colors.textPrimary, marginTop: SPACING.xs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
