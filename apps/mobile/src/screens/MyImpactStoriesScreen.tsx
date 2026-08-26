import { useMemo } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../navigation/types';
import type { MainTabParamList } from '../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { listMyImpactStories, type ImpactStory } from '@uthavu/libs-mobile/api/impactStories';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import EmptyState from '@uthavu/libs-mobile/components/EmptyState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Navigation = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList>,
  BottomTabNavigationProp<MainTabParamList>
>;

// Profile → My Impact Stories: the union of completed reports I posted
// and completed missions I volunteered for (apps/api/src/impact-stories/
// merges + de-dupes both angles server-side).
export default function MyImpactStoriesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation(['impactStories', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Navigation>();

  const { data: stories, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['myImpactStories'],
    queryFn: listMyImpactStories,
  });

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <BackHeader title={t('title')} />
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={80} borderRadius={RADIUS.lg} style={styles.skeletonRow} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && !stories) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <BackHeader title={t('title')} />

      <FlatList
        data={stories ?? []}
        keyExtractor={(s) => s.reportId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primaryGreen} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Sparkles size={40} color={colors.textSecondary} strokeWidth={1.5} />}
            title={t('emptyTitle')}
            subtitle={t('emptySubtitle')}
          />
        }
        renderItem={({ item }: { item: ImpactStory }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('RequestDetails', { reportId: item.reportId })}
            accessibilityRole="button"
            accessibilityLabel={t('rowLabel', { title: item.title, category: item.category.label })}
          >
            {item.photo ? (
              <Image source={{ uri: item.photo }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]} />
            )}
            <View style={styles.body}>
              <Text style={styles.category}>
                {item.category.emoji} {item.category.label}
              </Text>
              <Text style={styles.storyTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.linkRow}>
                <Text style={styles.linkText}>{t('viewStory')}</Text>
                <ArrowRight size={ICON_SIZE.xs} color={colors.primaryGreen} />
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    skeletonRow: { marginBottom: SPACING.sm },
    card: {
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: SPACING.sm,
    },
    photo: { width: 72, height: 72, borderRadius: RADIUS.md },
    photoPlaceholder: { backgroundColor: colors.border },
    body: { flex: 1, justifyContent: 'center' },
    category: { ...TYPE.captionStrong, color: colors.textSecondary },
    storyTitle: { ...TYPE.bodyStrong, color: colors.textPrimary, marginTop: SPACING.xxs },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs, marginTop: SPACING.xs },
    linkText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },
  });
