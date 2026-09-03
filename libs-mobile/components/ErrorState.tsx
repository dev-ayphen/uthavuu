import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WifiOff, type LucideIcon } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, SPACING, TYPE } from '../theme/tokens';
import Button from './Button';

type Props = {
  message?: string;
  /**
   * Omit for a TERMINAL failure — one retrying cannot fix.
   *
   * Without this the component always offered Retry, which is right for a
   * dropped connection and actively misleading for anything else: a report an
   * admin removed rendered "Check your connection" under a WiFi-off icon with a
   * button that could only ever fail again. A button that cannot work is worse
   * than no button, because the user keeps pressing it.
   */
  onRetry?: () => void;
  retrying?: boolean;
  /** Defaults to WifiOff — override so the icon matches the actual failure. */
  icon?: LucideIcon;
};

const DEFAULT_MESSAGE = "Couldn't load this. Check your connection and try again.";

// One full-section error view for the whole app — a screen renders this in
// place of its content when a query has genuinely failed (not just loading),
// so a real network/API failure has a way out instead of a skeleton that
// never resolves.
export default function ErrorState({
  message = DEFAULT_MESSAGE,
  onRetry,
  retrying,
  icon: Icon = WifiOff,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Icon size={ICON_SIZE.xl} color={colors.textSecondary} strokeWidth={1.5} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button
          label="Retry"
          variant="secondary"
          onPress={onRetry}
          loading={retrying}
          style={styles.button}
        />
      ) : null}
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
      padding: SPACING.xl,
      gap: SPACING.sm,
    },
    message: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
    button: { marginTop: SPACING.xs },
  });
