import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../theme/ThemeProvider';
import { SPACING, TYPE } from '../../../theme/tokens';
import TextField from '../../../components/TextField';

type Props = {
  title: string;
  description: string;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
};

export default function DetailsStep({ title, description, onChangeTitle, onChangeDescription }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>Describe the situation</Text>
      <Text style={styles.subtitle}>Keep it short and specific — this is what people see first.</Text>

      <TextField
        value={title}
        onChangeText={onChangeTitle}
        placeholder="Title, e.g. 'Injured dog near the market'"
        autoCapitalize="sentences"
        autoFocus
        accessibilityLabel="Title"
      />
      <TextField
        value={description}
        onChangeText={onChangeDescription}
        placeholder="What's happening, and what kind of help is needed?"
        autoCapitalize="sentences"
        multiline
        accessibilityLabel="Description"
        style={styles.field}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    field: { marginTop: SPACING.sm },
  });
