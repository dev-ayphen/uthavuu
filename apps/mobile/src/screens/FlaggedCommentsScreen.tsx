import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flag } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../navigation/types';
import type { MainTabParamList } from '../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { listMyFlaggedComments, type FlaggedComment } from '@uthavu/libs-mobile/api/comments';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import EmptyState from '@uthavu/libs-mobile/components/EmptyState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Navigation = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList>,
  BottomTabNavigationProp<MainTabParamList>
>;

// Profile → Flagged Comments. What's real here is comment-level flagging
// (see apps/api/src/db/schema/comments-schema.ts's own top-of-file
// comment) — this is honestly "comments I've flagged", not a fabricated
// whole-report flagging system that doesn't exist in this codebase.
export default function FlaggedCommentsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation(['flaggedComments', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Navigation>();

  const { data: flags, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['flaggedComments'],
    queryFn: listMyFlaggedComments,
  });

  const reasonLabel = (reason: FlaggedComment['reason']) =>
    t(`reason.${reason}`, { defaultValue: reason });
  const statusLabel = (status: FlaggedComment['status']) =>
    t(`status.${status}`, { defaultValue: status });
  // No admin console exists yet to move a flag past 'submitted' — every real
  // flag shows that tone today. The other three are mapped for when one does.
  const statusTone = (status: FlaggedComment['status']) =>
    status === 'under_review' ? TONES.soon
    : status === 'action_taken' ? TONES.critical
    : status === 'dismissed' ? TONES.expired
    : TONES.normal;

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <BackHeader title={t('title')} />
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={78} borderRadius={RADIUS.lg} style={styles.skeletonRow} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && !flags) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <BackHeader title={t('title')} />

      <FlatList
        data={flags ?? []}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primaryGreen} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Flag size={40} color={colors.textSecondary} strokeWidth={1.5} />}
            title={t('emptyTitle')}
            subtitle={t('emptySubtitle')}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('RequestDetails', { reportId: item.reportId })}
            accessibilityRole="button"
            accessibilityLabel={t('rowLabel', { title: item.reportTitle, reason: reasonLabel(item.reason) })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.category}>
                {item.category.emoji} {item.category.label}
              </Text>
              <Text style={styles.time}>{formatRelativeTime(item.flaggedAt)}</Text>
            </View>
            <Text style={styles.reportTitle} numberOfLines={1}>
              {item.reportTitle}
            </Text>
            <View style={styles.commentBox}>
              <Text style={styles.commentBody} numberOfLines={2}>
                {item.commentBody}
              </Text>
            </View>
            <View style={styles.pillRow}>
              <View style={styles.reasonPill}>
                <Flag size={ICON_SIZE.xs} color={colors.danger} />
                <Text style={styles.reasonText}>{reasonLabel(item.reason)}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusTone(item.status).fill, borderColor: statusTone(item.status).border }]}>
                <Text style={[styles.statusText, { color: statusTone(item.status).fg }]}>{statusLabel(item.status)}</Text>
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
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    category: { ...TYPE.captionStrong, color: colors.textSecondary },
    time: { ...TYPE.caption, color: colors.textSecondary },
    reportTitle: { ...TYPE.bodyStrong, color: colors.textPrimary, marginTop: SPACING.xxs },
    commentBox: {
      marginTop: SPACING.xs,
      padding: SPACING.xs,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    commentBody: { ...TYPE.body, color: colors.textSecondary },
    pillRow: { flexDirection: 'row', gap: SPACING.xxs, marginTop: SPACING.xs },
    reasonPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs / 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
    },
    reasonText: { ...TYPE.footnoteRegular, color: colors.danger },
    statusPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs / 2,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
    },
    statusText: { ...TYPE.footnoteRegular },
  });
