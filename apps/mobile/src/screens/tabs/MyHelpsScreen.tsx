import { useMemo, useState } from 'react';
import { Image, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, HeartHandshake } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMyMissions, type MyMission } from '@uthavu/libs-mobile/api/missions';
import { formatTimeRemaining, getUrgencyTone } from '@uthavu/libs-mobile/lib/urgency';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

type Section = { title: string; data: MyMission[] };

// Missions this user has volunteered for — active (joined/active) and past
// (released). There is no "completed" section: mission_volunteers only
// tracks joined/active/released — completion, proof photo, and
// verification are a deliberately separate, not-yet-built feature.
export default function MyHelpsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();

  const { data: missions, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['myMissions'],
    queryFn: getMyMissions,
  });

  const sections: Section[] = useMemo(() => {
    if (!missions) return [];
    const active = missions.filter((m) => m.myStatus === 'joined' || m.myStatus === 'active');
    const past = missions.filter((m) => m.myStatus === 'released');
    const out: Section[] = [];
    if (active.length) out.push({ title: 'Active', data: active });
    if (past.length) out.push({ title: 'Past', data: past });
    return out;
  }, [missions]);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <Text style={styles.header}>My Helps</Text>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <MissionRowSkeleton key={i} styles={styles} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && !missions) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <Text style={styles.header}>My Helps</Text>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.reportId}
        contentContainerStyle={styles.list}
        refreshing={isFetching}
        onRefresh={refetch}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <HeartHandshake size={40} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No missions yet</Text>
            <Text style={styles.emptySubtitle}>
              Missions you volunteer for will show up here once you accept a request.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <MissionRow
            mission={item}
            colors={colors}
            styles={styles}
            onPress={() => navigation.navigate('RequestDetails', { reportId: item.reportId })}
          />
        )}
      />
    </View>
  );
}

function statusBadge(mission: MyMission, colors: ColorScheme) {
  if (mission.myStatus === 'joined') {
    const tone = TONES[getUrgencyTone(mission.myConfirmDeadline ?? new Date().toISOString())];
    return {
      label: `Joined — ${formatTimeRemaining(mission.myConfirmDeadline ?? new Date().toISOString())}`,
      fg: tone.fg,
      fill: tone.fill,
      border: tone.border,
    };
  }
  if (mission.myStatus === 'active') {
    return { label: 'Active', fg: colors.primaryGreen, fill: colors.primaryGreenLight, border: colors.primaryGreen };
  }
  return { label: 'Released', fg: colors.textSecondary, fill: colors.bgElevated, border: colors.border };
}

function MissionRow({
  mission,
  colors,
  styles,
  onPress,
}: {
  mission: MyMission;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  const badge = statusBadge(mission, colors);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mission.title}, ${mission.category.label}, ${badge.label}`}
      accessibilityHint="View request details"
    >
      {mission.photo ? (
        <Image source={{ uri: mission.photo }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowMetaTop}>
          <Text style={styles.rowCategory}>
            {mission.category.emoji} {mission.category.label}
          </Text>
        </View>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {mission.title}
        </Text>
        <View style={[styles.badge, { backgroundColor: badge.fill, borderColor: badge.border }]}>
          <Clock size={ICON_SIZE.xs} color={badge.fg} />
          <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Mirrors MissionRow's real layout so the initial load doesn't jump when
// real content replaces it.
function MissionRowSkeleton({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.row}>
      <Skeleton width={64} height={64} borderRadius={RADIUS.md} />
      <View style={styles.rowBody}>
        <Skeleton width={90} height={11} />
        <Skeleton width="70%" height={13} style={styles.skeletonLine} />
        <Skeleton width={110} height={18} borderRadius={RADIUS.sm} style={styles.skeletonLine} />
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { ...TYPE.pageTitle, color: colors.textPrimary, paddingHorizontal: SIZES.padding, marginBottom: SPACING.sm },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    sectionTitle: {
      ...TYPE.subheadStrong,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xxs,
    },
    skeletonLine: { marginTop: SPACING.xxs },
    row: {
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    photo: { width: 64, height: 64, borderRadius: RADIUS.md },
    photoPlaceholder: { backgroundColor: colors.border },
    rowBody: { flex: 1, justifyContent: 'center' },
    rowMetaTop: { flexDirection: 'row', alignItems: 'center' },
    rowCategory: { ...TYPE.caption, color: colors.textSecondary },
    rowTitle: { ...TYPE.bodyStrong, color: colors.textPrimary, marginTop: 2 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.xxs,
      borderWidth: 1,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.xxs,
      paddingVertical: SPACING.xxs / 2,
      marginTop: SPACING.xs,
    },
    badgeText: { ...TYPE.caption, fontWeight: '700' },
    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs, paddingHorizontal: SPACING.xl },
    emptyTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
