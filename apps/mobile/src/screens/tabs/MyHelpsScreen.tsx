import { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, HeartHandshake, MapPin } from 'lucide-react-native';
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMyMissions, type MyMission } from '@uthavu/libs-mobile/api/missions';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

type QueueTab = 'active' | 'stories';

// Active Queue = still ongoing (joined/active) on a report that isn't
// completed yet. Impact Stories = the report reached `completed`,
// regardless of this volunteer's own myStatus (which stays 'active'
// forever after completion — see mission-completion.md BR-7, not a bug).
// A mission this volunteer left/timed out (myStatus 'released') on a
// still-open report has no slot in this design — filtered out entirely.
function splitMissions(missions: MyMission[]): { active: MyMission[]; stories: MyMission[] } {
  const active = missions.filter((m) => m.myStatus !== 'released' && m.reportStatus !== 'completed');
  const stories = missions.filter((m) => m.reportStatus === 'completed');
  return { active, stories };
}

export default function MyHelpsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation(['tabs', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<QueueTab>('active');

  const { data: missions, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['myMissions'],
    queryFn: getMyMissions,
  });

  // This is a bottom-tab screen — switching tabs doesn't unmount/remount it,
  // so without this, accepting a mission elsewhere and coming straight back
  // here would show stale data until a manual pull-to-refresh. Mirrors
  // RequestDetailsScreen's identical pattern.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['myMissions'] });
    }, [queryClient])
  );

  const { active, stories } = useMemo(() => splitMissions(missions ?? []), [missions]);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={styles.headerTitle}>{t('myHelps.header')}</Text>
        </View>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <ActiveQueueCardSkeleton key={i} styles={styles} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && !missions) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  const data = tab === 'active' ? active : stories;

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('myHelps.header')}</Text>
        <View style={styles.headerCountBadge}>
          <Text style={styles.headerCountBadgeText}>{active.length}</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>{t('myHelps.subtitle')}</Text>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'active' && styles.tabPillActive]}
          onPress={() => setTab('active')}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'active' }}
        >
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>
            {t('myHelps.tabActiveQueue', { count: active.length })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabPill, tab === 'stories' && styles.tabPillActive]}
          onPress={() => setTab('stories')}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'stories' }}
        >
          <Text style={[styles.tabText, tab === 'stories' && styles.tabTextActive]}>
            {t('myHelps.tabImpactStories', { count: stories.length })}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.reportId}
        contentContainerStyle={styles.list}
        refreshing={isFetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.empty}>
            <HeartHandshake size={40} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>
              {t(tab === 'active' ? 'myHelps.emptyActiveTitle' : 'myHelps.emptyStoriesTitle')}
            </Text>
            <Text style={styles.emptySubtitle}>
              {t(tab === 'active' ? 'myHelps.emptyActiveSubtitle' : 'myHelps.emptyStoriesSubtitle')}
            </Text>
          </View>
        }
        renderItem={({ item }) =>
          tab === 'active' ? (
            <ActiveQueueCard
              mission={item}
              colors={colors}
              styles={styles}
              t={t}
              onPress={() => navigation.navigate('VolunteerJourney', { reportId: item.reportId })}
            />
          ) : (
            <ImpactStoryCard
              mission={item}
              colors={colors}
              styles={styles}
              t={t}
              onPress={() => navigation.navigate('RequestDetails', { reportId: item.reportId })}
            />
          )
        }
      />
    </View>
  );
}

function ActiveQueueCard({
  mission,
  colors,
  styles,
  t,
  onPress,
}: {
  mission: MyMission;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  t: TFunction;
  onPress: () => void;
}) {
  const isActive = mission.myStatus === 'active';
  // TONES.soon (amber) is the closest existing semantic tone to "in
  // progress" — this project has no dedicated in-progress tone, and
  // inventing a new color for one badge isn't worth it.
  const badge = isActive
    ? { icon: '🟠', label: t('myHelps.statusHelpingInProgress'), tone: TONES.soon }
    : { icon: '🔵', label: t('myHelps.statusVolunteerAssigned'), tone: { fg: COLORS.infoStrong, fill: COLORS.infoBg, border: COLORS.infoBorder } };
  const timeLabel = t(isActive ? 'myHelps.assignedTimeAgo' : 'myHelps.acceptedTimeAgo', {
    time: formatRelativeTime(mission.joinedAt),
  });

  return (
    <View
      style={styles.card}
      accessibilityLabel={t('myHelps.rowLabel', {
        title: mission.title,
        category: mission.category.label,
        status: badge.label,
      })}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.statusBadge, { backgroundColor: badge.tone.fill, borderColor: badge.tone.border }]}>
          <Text style={[styles.statusBadgeText, { color: badge.tone.fg }]}>
            {badge.icon} {badge.label}
          </Text>
        </View>
        <Text style={styles.cardTime}>{timeLabel}</Text>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {mission.title}
      </Text>

      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMetaText}>
          {mission.category.emoji} {mission.category.label}
        </Text>
        {mission.landmark && (
          <>
            <Text style={styles.cardMetaDot}>·</Text>
            <MapPin size={ICON_SIZE.xs} color={colors.textSecondary} />
            <Text style={styles.cardMetaText} numberOfLines={1}>
              {mission.landmark}
            </Text>
          </>
        )}
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardBottomRow}>
        <Text style={styles.cardPostedBy} numberOfLines={1}>
          {mission.reporterName ? t('myHelps.postedBy', { name: mission.reporterName }) : t('myHelps.postedAnonymously')}
        </Text>
        <Button
          label={t('myHelps.viewProgress')}
          variant="secondary"
          onPress={onPress}
          icon={<ArrowRight size={ICON_SIZE.xs} color={colors.textPrimary} />}
          style={styles.viewProgressButton}
        />
      </View>
    </View>
  );
}

function ImpactStoryCard({
  mission,
  colors,
  styles,
  t,
  onPress,
}: {
  mission: MyMission;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  t: TFunction;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.storyCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('myHelps.rowLabel', {
        title: mission.title,
        category: mission.category.label,
        status: t('myHelps.tabImpactStories', { count: 0 }),
      })}
    >
      {mission.photo ? (
        <Image source={{ uri: mission.photo }} style={styles.storyPhoto} />
      ) : (
        <View style={[styles.storyPhoto, styles.storyPhotoPlaceholder]} />
      )}
      <View style={styles.storyBody}>
        <Text style={styles.cardMetaText}>
          {mission.category.emoji} {mission.category.label}
        </Text>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {mission.title}
        </Text>
        <View style={styles.storyLinkRow}>
          <Text style={styles.storyLinkText}>{t('myHelps.viewStory')}</Text>
          <ArrowRight size={ICON_SIZE.xs} color={colors.primaryGreen} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Mirrors ActiveQueueCard's real layout so the initial load doesn't jump
// when real content replaces it.
function ActiveQueueCardSkeleton({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Skeleton width={130} height={22} borderRadius={RADIUS.sm} />
        <Skeleton width={90} height={11} />
      </View>
      <Skeleton width="80%" height={16} style={styles.skeletonLine} />
      <Skeleton width="60%" height={12} style={styles.skeletonLine} />
      <View style={styles.cardDivider} />
      <View style={styles.cardBottomRow}>
        <Skeleton width={100} height={12} />
        <Skeleton width={110} height={32} borderRadius={RADIUS.pill} />
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SIZES.padding,
      marginBottom: SPACING.xxs,
    },
    headerTitle: { ...TYPE.pageTitle, color: colors.textPrimary },
    headerCountBadge: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      minWidth: 24,
      alignItems: 'center',
    },
    headerCountBadgeText: { ...TYPE.captionStrong, color: colors.textSecondary },
    subtitle: {
      ...TYPE.body,
      color: colors.textSecondary,
      paddingHorizontal: SIZES.padding,
      marginBottom: SPACING.sm,
    },
    tabsRow: {
      flexDirection: 'row',
      gap: SPACING.xs,
      paddingHorizontal: SIZES.padding,
      marginBottom: SPACING.sm,
    },
    tabPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
    },
    tabPillActive: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabText: { ...TYPE.footnote, color: colors.textSecondary },
    tabTextActive: { color: colors.textPrimary, fontWeight: '700' },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    skeletonLine: { marginTop: SPACING.xs },
    card: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: SPACING.md,
    },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusBadge: {
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xxs / 2,
    },
    statusBadgeText: { ...TYPE.captionStrong, fontWeight: '700' },
    cardTime: { ...TYPE.caption, color: colors.textSecondary },
    cardTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.sm },
    cardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      marginTop: SPACING.xxs,
      flexWrap: 'wrap',
    },
    cardMetaText: { ...TYPE.body, color: colors.textSecondary },
    cardMetaDot: { ...TYPE.body, color: colors.textSecondary },
    cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: SPACING.sm },
    cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
    cardPostedBy: { ...TYPE.body, color: colors.textSecondary, flex: 1 },
    viewProgressButton: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
    storyCard: {
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: SPACING.sm,
    },
    storyPhoto: { width: 72, height: 72, borderRadius: RADIUS.md },
    storyPhotoPlaceholder: { backgroundColor: colors.border },
    storyBody: { flex: 1, justifyContent: 'center' },
    storyLinkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs, marginTop: SPACING.xs },
    storyLinkText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },
    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs, paddingHorizontal: SPACING.xl },
    emptyTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
