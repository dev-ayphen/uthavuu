import { useMemo, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMyMissions, type MyMission } from '@uthavu/libs-mobile/api/missions';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import EmptyState from '@uthavu/libs-mobile/components/EmptyState';
import TabBar, { type TabBarItem } from '@uthavu/libs-mobile/components/TabBar';

type Props = NativeStackScreenProps<RootStackParamList, 'MissionJournal'>;
type JournalTab = 'all' | 'completed' | 'cancelled' | 'left';

// Profile → Mission Journal (My Activity) — the user's COMPLETE volunteer
// history, every mission ever joined regardless of current status. Distinct
// from My Helps' "Active Queue" tab, which only shows what's still open.
// Reuses GET /users/me/missions (getMyMissions()) — that endpoint already
// returns every mission this user has ever joined, no status filtering
// server-side; this screen is a different client-side breakdown of the
// exact same data My Helps already fetches (same query key, shared cache).
//
// "Cancelled" here covers both real report statuses 'closed' (reporter
// cancelled) and 'expired' (nobody completed it in time) — from a
// volunteer's own perspective both mean "this mission ended without being
// completed," and there's no separate Expired tab in the product spec for
// this screen. "Left" takes priority over report status: if this user's
// own myStatus is 'released', it's in Left regardless of what happened to
// the report afterward.
export default function MissionJournalScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('missionJournal');
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<JournalTab>('all');

  const { data: missions, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['myMissions'],
    queryFn: getMyMissions,
  });

  const filtered = useMemo(() => {
    if (!missions) return [];
    switch (tab) {
      case 'completed':
        return missions.filter((m) => m.myStatus !== 'released' && m.reportStatus === 'completed');
      case 'cancelled':
        return missions.filter(
          (m) => m.myStatus !== 'released' && (m.reportStatus === 'closed' || m.reportStatus === 'expired')
        );
      case 'left':
        return missions.filter((m) => m.myStatus === 'released');
      default:
        return missions;
    }
  }, [missions, tab]);

  const tabs: TabBarItem<JournalTab>[] = [
    { key: 'all', label: t('tabAll') },
    { key: 'completed', label: t('tabCompleted') },
    { key: 'cancelled', label: t('tabCancelled') },
    { key: 'left', label: t('tabLeft') },
  ];

  const emptyCopy = {
    all: { title: t('emptyAllTitle'), subtitle: t('emptyAllSubtitle') },
    completed: { title: t('emptyCompletedTitle'), subtitle: t('emptyCompletedSubtitle') },
    cancelled: { title: t('emptyCancelledTitle'), subtitle: t('emptyCancelledSubtitle') },
    left: { title: t('emptyLeftTitle'), subtitle: t('emptyLeftSubtitle') },
  }[tab];

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      <BackHeader title={t('title')} spacerWidth={SPACING.xl} />

      <View style={styles.tabsWrap}>
        <TabBar items={tabs} selected={tab} onSelect={setTab} scrollable />
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton width={54} height={54} borderRadius={RADIUS.sm} />
              <View style={styles.cardBody}>
                <Skeleton width="60%" height={12} />
                <Skeleton width="90%" height={14} style={styles.skeletonLine} />
              </View>
            </View>
          ))}
        </View>
      ) : isError && !missions ? (
        <ErrorState onRetry={refetch} retrying={isFetching} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.reportId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primaryGreen} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<BookOpen size={40} color={colors.textSecondary} strokeWidth={1.5} />}
              title={emptyCopy.title}
              subtitle={emptyCopy.subtitle}
            />
          }
          renderItem={({ item }) => (
            <MissionCard
              mission={item}
              colors={colors}
              styles={styles}
              t={t}
              onPress={() => navigation.navigate('RequestDetails', { reportId: item.reportId })}
            />
          )}
        />
      )}
    </View>
  );
}

function statusBadge(mission: MyMission) {
  if (mission.myStatus === 'released') return { label: 'statusReleased', tone: TONES.expired };
  if (mission.reportStatus === 'completed') return { label: 'statusCompleted', tone: TONES.normal };
  if (mission.reportStatus === 'closed' || mission.reportStatus === 'expired') {
    return { label: 'statusCancelled', tone: TONES.expired };
  }
  if (mission.myStatus === 'active') return { label: 'statusActive', tone: TONES.soon };
  return { label: 'statusJoined', tone: TONES.normal };
}

function MissionCard({
  mission,
  colors,
  styles,
  t,
  onPress,
}: {
  mission: MyMission;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  t: (key: string, options?: Record<string, unknown>) => string;
  onPress: () => void;
}) {
  const badge = statusBadge(mission);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={mission.title}>
      {mission.photo ? (
        <Image source={{ uri: mission.photo }} style={styles.cardPhoto} />
      ) : (
        <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
          <Text style={styles.cardPhotoEmoji}>{mission.category.emoji}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={[styles.statusBadge, { backgroundColor: badge.tone.fill, borderColor: badge.tone.border }]}>
          <Text style={[styles.statusBadgeText, { color: badge.tone.fg }]}>{t(badge.label)}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {mission.title}
        </Text>
        <Text style={styles.cardMetaText} numberOfLines={1}>
          {mission.category.emoji} {mission.category.label}
          {mission.landmark ? ` · 📍 ${mission.landmark}` : ''}
        </Text>
        <Text style={styles.cardTime}>{t('joinedTimeAgo', { time: formatRelativeTime(mission.joinedAt) })}</Text>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    tabsWrap: { marginBottom: SPACING.sm },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    skeletonLine: { marginTop: SPACING.xs },
    card: {
      flexDirection: 'row',
      gap: SPACING.xs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.xs,
    },
    cardPhoto: { width: 54, height: 54, borderRadius: RADIUS.sm },
    cardPhotoPlaceholder: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    cardPhotoEmoji: { fontSize: ICON_SIZE.md },
    cardBody: { flex: 1, justifyContent: 'center', gap: 2 },
    statusBadge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs / 2,
      marginBottom: SPACING.xxs / 2,
    },
    statusBadgeText: { ...TYPE.microLabel, fontWeight: '700' },
    cardTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    cardMetaText: { ...TYPE.caption, color: colors.textSecondary },
    cardTime: { ...TYPE.caption, color: colors.textSecondary },
  });
