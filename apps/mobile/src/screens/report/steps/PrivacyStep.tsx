import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../../../theme/tokens';
import ToggleRow from '../../../components/ToggleRow';

type Props = {
  anonymous: boolean;
  phoneVisible: boolean;
  onToggleAnonymous: (value: boolean) => void;
  onTogglePhoneVisible: (value: boolean) => void;
};

// docs/features/report-a-request.md US-4 — both default off, matching BR: a
// reporter opts INTO exposure, never the other way around.
export default function PrivacyStep({
  anonymous,
  phoneVisible,
  onToggleAnonymous,
  onTogglePhoneVisible,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>Privacy</Text>
      <Text style={styles.subtitle}>Control what's exposed about you on this report.</Text>

      <ToggleRow
        label="Post anonymously"
        subtitle="Hides your name, photo, and profession on the public report card"
        value={anonymous}
        onValueChange={onToggleAnonymous}
        style={styles.row}
      />
      <ToggleRow
        label="Share phone number with volunteers"
        subtitle="Only visible to someone who accepts your request"
        value={phoneVisible}
        onValueChange={onTogglePhoneVisible}
        style={styles.row}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    row: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.sm + 2,
      marginBottom: SPACING.sm,
    },
  });
