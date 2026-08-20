import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { ICON_SIZE, SPACING, TYPE } from '../theme/tokens';
import Button from './Button';

type Props = {
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
};

const DEFAULT_MESSAGE = "Couldn't load this. Check your connection and try again.";

// One full-section error view for the whole app — a screen renders this in
// place of its content when a query has genuinely failed (not just loading),
// so a real network/API failure has a way out instead of a skeleton that
// never resolves.
export default function ErrorState({ message = DEFAULT_MESSAGE, onRetry, retrying }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <WifiOff size={ICON_SIZE.xl} color={colors.textSecondary} strokeWidth={1.5} />
      <Text style={styles.message}>{message}</Text>
      <Button label="Retry" variant="secondary" onPress={onRetry} loading={retrying} style={styles.button} />
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
