import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'Legal'>;

// Settings → Terms / Privacy Policy / Community Guidelines. Real, honest
// content reflecting this project's actual decisions (CLAUDE.md App
// Profile, docs/PRODUCT-DECISIONS.md) — not generic boilerplate that claims
// things this app doesn't do (no payments, no email requirement, no rating
// system, single small team, not a large company with a DPO).
export default function LegalScreen({ route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['legal', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { topic } = route.params;

  const titleKey = `${topic}Title`;
  const bodyKey = `${topic}Body`;

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      <BackHeader title={t(titleKey)} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{t('lastUpdated')}</Text>
        <Text style={styles.body}>{t(bodyKey)}</Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: SIZES.padding, paddingBottom: SPACING.xxxl },
    updated: { ...TYPE.caption, color: colors.textSecondary, marginBottom: SPACING.md },
    body: { ...TYPE.body, color: colors.textPrimary, lineHeight: 22 },
  });
