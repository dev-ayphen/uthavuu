import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { CATEGORIES } from '@uthavu/libs-mobile/data/categories';
import Card from '@uthavu/libs-mobile/components/Card';

// docs/features/report-a-request.md US-1 — category selection is Step 1 (the
// Report tab itself); picking one pushes ReportFlow for the rest. Disaster
// Relief isn't in CATEGORIES at all (BR-3, admin-only), so there's nothing to
// filter out here.
export default function ReportCategoryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<
    CompositeNavigationProp<
      BottomTabNavigationProp<MainTabParamList>,
      NativeStackNavigationProp<RootStackParamList>
    >
  >();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.lg }]}
    >
      <Text style={styles.title}>Report a Request</Text>
      <Text style={styles.subtitle}>What kind of help is needed?</Text>

      <View style={styles.grid}>
        {CATEGORIES.map((cat) => (
          <Card
            key={cat.id}
            style={styles.card}
            onPress={() => navigation.navigate('ReportFlow', { categoryKey: cat.id })}
            accessibilityLabel={cat.title}
          >
            <View style={[styles.iconBox, { backgroundColor: cat.color + '20' }]}>
              <Text style={styles.emoji}>{cat.emoji}</Text>
            </View>
            <Text style={styles.cardTitle}>{cat.title}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    card: { width: '47%' },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.xl,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    emoji: { fontSize: 22 },
    cardTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
  });
