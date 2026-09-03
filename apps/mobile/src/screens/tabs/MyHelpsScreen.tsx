import { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, CheckCircle2, HeartHandshake, ImageOff, MapPin } from 'lucide-react-native';
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
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMyMissions, type MyMission } from '@uthavu/libs-mobile/api/missions';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import ScreenHeader from '@uthavu/libs-mobile/components/ScreenHeader';
import { Divider, StatusBadge } from '@uthavu/libs-mobile/components';

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
        <ScreenHeader title={t('myHelps.header')} />
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
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      <ScreenHeader
        title={t('myHelps.header')}
        badge={active.length > 0 ? active.length : undefined}
      />

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
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primaryGreen} />
        }
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
    : { icon: '🔵', label: t('myHelps.statusVolunteerAssigned'), tone: TONES.info };
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
        <StatusBadge
          label={`${badge.icon} ${badge.label}`}
          tone={badge.tone}
          align="inline"
          style={styles.statusBadgeBox}
          labelStyle={styles.statusBadgeLabel}
        />
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

      <Divider spacing={SPACING.sm / 2} />

      <View style={styles.cardBottomRow}>
        <Text style={styles.cardPostedBy} numberOfLines={1}>
          {mission.reporterDeleted
            ? t('myHelps.postedByDeletedUser')
            : mission.reporterName
              ? t('myHelps.postedBy', { name: mission.reporterName })
              : t('myHelps.postedAnonymously')}
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
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={t('myHelps.rowLabel', {
        title: mission.title,
        category: mission.category.label,
        status: t('myHelps.tabImpactStories', { count: 0 }),
      })}
    >
      {/* Hero image or placeholder */}
      {mission.photo ? (
        <Image source={{ uri: mission.photo }} style={styles.storyHeroImage} />
      ) : (
        <View style={[styles.storyHeroImage, styles.storyHeroPlaceholder]}>
          <ImageOff size={28} color={colors.textSecondary} strokeWidth={1.5} />
        </View>
      )}

      {/* Completed badge top-right */}
      <View style={styles.storyCompletedBadge}>
        <CheckCircle2 size={13} color="#16A34A" />
        <Text style={styles.storyCompletedText}>{t('myHelps.storyCompletedBadge')}</Text>
      </View>

      {/* Card body */}
      <View style={styles.storyBody}>
        {/* Category pill */}
        <StatusBadge
          label={`${mission.category.emoji} ${mission.category.label}`}
          tone={{ fg: colors.textSecondary, fill: colors.bg, border: colors.border }}
          style={styles.storyCategoryPillBox}
          labelStyle={styles.storyCategoryLabel}
        />

        <Text style={styles.storyTitle} numberOfLines={2}>
          {mission.title}
        </Text>

        {mission.landmark ? (
          <View style={styles.storyLocationRow}>
            <MapPin size={11} color={colors.textSecondary} />
            <Text style={styles.storyLocationText} numberOfLines={1}>{mission.landmark}</Text>
          </View>
        ) : null}

        <Divider spacing={SPACING.xs} />

        <View style={styles.storyFooterRow}>
          <Text style={styles.storyHelperLabel}>You helped · {formatRelativeTime(mission.joinedAt)}</Text>
          <View style={styles.storyViewBtn}>
            <Text style={styles.storyViewBtnText}>{t('myHelps.viewStory')}</Text>
            <ArrowRight size={12} color="#FFFFFF" />
          </View>
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
      <Divider spacing={SPACING.sm / 2} />
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
    tabsRow: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: SIZES.padding,
      marginBottom: SPACING.xs,
    },
    tabPill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bgElevated,
    },
    tabPillActive: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabText: { ...TYPE.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    tabTextActive: { color: colors.textPrimary, fontWeight: '800' },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.xs },
    skeletonLine: { marginTop: SPACING.xxs },
    card: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.xs + 2,
    },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    // Tighter than StatusBadge's `sm` padding, and 9.5/800 is off the type
    // ramp entirely — both preserved verbatim rather than snapped to a token
    // that would resize the pill. microLabel's letterSpacing rides in as before.
    statusBadgeBox: { paddingHorizontal: 6, paddingVertical: 1 },
    statusBadgeLabel: { fontSize: 9.5, fontWeight: '800' },
    cardTime: { ...TYPE.caption, fontSize: 10.5, color: colors.textSecondary },
    cardTitle: { ...TYPE.bodyStrong, fontSize: 13.5, color: colors.textPrimary, marginTop: 4, marginBottom: 2 },
    cardMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 1,
      flexWrap: 'wrap',
    },
    cardMetaText: { ...TYPE.caption, fontSize: 11, color: colors.textSecondary },
    cardMetaDot: { ...TYPE.caption, fontSize: 11, color: colors.textSecondary },
    cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.xs },
    cardPostedBy: { ...TYPE.caption, fontSize: 11.5, color: colors.textSecondary, flex: 1 },
    viewProgressButton: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: RADIUS.pill,
      minHeight: 28,
    },
    storyCard: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
    },
    storyHeroImage: {
      width: '100%',
      height: 148,
    },
    storyHeroPlaceholder: {
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storyCompletedBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#86EFAC',
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    storyCompletedText: {
      ...TYPE.microLabel,
      color: '#16A34A',
      fontWeight: '700',
      fontSize: 10,
    },
    storyBody: {
      padding: SPACING.sm,
    },
    // Geometry is StatusBadge's `sm` exactly; only the gap under it and the
    // off-ramp 10.5/600 label had to be carried over.
    storyCategoryPillBox: { marginBottom: SPACING.sm / 2 },
    storyCategoryLabel: { fontSize: 10.5, fontWeight: '600' },
    storyTitle: { ...TYPE.bodyStrong, fontSize: 14.5, color: colors.textPrimary, marginBottom: 4, lineHeight: 20 },
    storyLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
    storyLocationText: { ...TYPE.caption, fontSize: 11, color: colors.textSecondary },
    storyFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    storyHelperLabel: { ...TYPE.caption, fontSize: 11, color: colors.textSecondary },
    storyViewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primaryGreen,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    storyViewBtnText: { ...TYPE.caption, fontSize: 11.5, color: '#FFFFFF', fontWeight: '700' },
    empty: { alignItems: 'center', paddingTop: SPACING.xl, gap: SPACING.xs, paddingHorizontal: SPACING.lg },
    emptyTitle: { ...TYPE.subheadStrong, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center' },
  });
