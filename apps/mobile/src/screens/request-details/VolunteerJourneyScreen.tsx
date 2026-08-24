import { useMemo } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, MapPin, Navigation } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getReport } from '@uthavu/libs-mobile/api/reports';
import { confirmRequest, getRoster, leaveRequest } from '@uthavu/libs-mobile/api/missions';
import { formatTimeRemaining } from '@uthavu/libs-mobile/lib/urgency';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import Button from '@uthavu/libs-mobile/components/Button';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import RequestDetailsSkeleton from './RequestDetailsSkeleton';
import MissionChat from './MissionChat';

type Props = NativeStackScreenProps<RootStackParamList, 'VolunteerJourney'>;

// Reached from My Helps' "View Progress" — a focused view of THIS
// volunteer's own progress on a mission they've already joined/confirmed,
// as opposed to RequestDetailsScreen's general-purpose view. Reuses the
// exact same getReport()/getRoster() data RequestDetailsScreen already
// fetches; this is an alternate presentation of it, not new data.
export default function VolunteerJourneyScreen({ route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const queryClient = useQueryClient();

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportIsError,
    isFetching: reportFetching,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => getReport(reportId),
  });
  const {
    data: roster,
    isLoading: rosterLoading,
    isError: rosterIsError,
    isFetching: rosterFetching,
    refetch: refetchRoster,
  } = useQuery({
    queryKey: ['roster', reportId],
    queryFn: () => getRoster(reportId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roster', reportId] });
    queryClient.invalidateQueries({ queryKey: ['report', reportId] });
    queryClient.invalidateQueries({ queryKey: ['myMissions'] });
  };
  const onError = (e: unknown) => {
    Alert.alert(t('couldNotCompleteThat'), e instanceof ApiError ? e.message : t('common:tryAgain'));
  };

  const confirmMutation = useMutation({ mutationFn: () => confirmRequest(reportId), onSuccess: invalidate, onError });
  const leaveMutation = useMutation({ mutationFn: () => leaveRequest(reportId), onSuccess: invalidate, onError });

  if (reportLoading || rosterLoading) {
    return <RequestDetailsSkeleton />;
  }
  if ((reportIsError || rosterIsError) && (!report || !roster)) {
    return (
      <ErrorState
        onRetry={() => {
          refetchReport();
          refetchRoster();
        }}
        retrying={reportFetching || rosterFetching}
      />
    );
  }
  if (!report || !roster) {
    return <RequestDetailsSkeleton />;
  }

  const onNavigate = () => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`);
  };

  const onLeave = () => {
    Alert.alert(t('leaveConfirmTitle'), t('leaveConfirmMessage'), [
      { text: t('common:cancel'), style: 'cancel' },
      { text: t('leaveConfirmAction'), style: 'destructive', onPress: () => leaveMutation.mutate() },
    ]);
  };

  const activeCount = roster.volunteers.filter((v) => v.status !== 'released').length;
  const canLeave = roster.myStatus === 'joined' || roster.myStatus === 'active';

  return (
    <View style={styles.root}>
      <BackHeader title={t('volunteerJourneyTitle')} style={{ paddingTop: insets.top + SPACING.xs }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {roster.myStatus === 'joined' && (
          <View style={styles.bannerCard}>
            <View style={styles.dot} />
            <View style={styles.bannerBody}>
              <Text style={styles.bannerTitle}>{t('journeyJoinedBannerTitle')}</Text>
              <Text style={styles.bannerSubtitle}>{t('journeyJoinedBannerSubtitle')}</Text>
            </View>
          </View>
        )}
        {roster.myStatus === 'active' && (
          <View style={styles.bannerCard}>
            <View style={styles.dot} />
            <View style={styles.bannerBody}>
              <Text style={styles.bannerTitle}>{t('journeyActiveBannerTitle')}</Text>
              <Text style={styles.bannerSubtitle}>{t('journeyActiveBannerSubtitle')}</Text>
            </View>
          </View>
        )}

        {roster.myStatus === 'joined' && (
          <View style={styles.timerBox}>
            <View style={styles.timerHeaderRow}>
              <View style={styles.timerLabelPill}>
                <Clock size={ICON_SIZE.xs} color={TONES.soon.fg} />
                <Text style={styles.timerLabelText}>{t('journeyResponseTimerLabel')}</Text>
              </View>
              {roster.myConfirmDeadline && (
                <Text style={styles.timerValue}>{formatTimeRemaining(roster.myConfirmDeadline)}</Text>
              )}
            </View>
            <Text style={styles.timerBody}>{t('journeyResponseTimerBody')}</Text>
            <Button
              label={t('startHelping')}
              onPress={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              style={styles.timerButton}
            />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.categoryText}>
            {report.category.emoji} {report.category.label}
          </Text>
          <Text style={styles.reportTitle}>{report.title}</Text>
          {report.landmark && (
            <View style={styles.locationRow}>
              <MapPin size={ICON_SIZE.sm} color={colors.textSecondary} />
              <Text style={styles.locationText}>{report.landmark}</Text>
            </View>
          )}
          <Button
            label={t('journeyNavigateViaMaps')}
            variant="secondary"
            icon={<Navigation size={ICON_SIZE.sm} color={colors.primaryGreen} />}
            onPress={onNavigate}
            style={styles.navigateButton}
          />

          <View style={styles.divider} />

          <Text style={styles.teamLabel}>
            {t('journeyMissionTeam', { ready: activeCount, needed: roster.neededVolunteers })}
          </Text>
          <View style={styles.teamRow}>
            {roster.volunteers.map((v) => (
              <View key={v.id} style={styles.teamChip}>
                <Avatar uri={v.avatarUrl} label={v.name} size={20} />
                <Text style={styles.teamChipText} numberOfLines={1}>
                  {v.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.chatWrap}>
          <MissionChat reportId={reportId} locked={report.status === 'completed'} />
        </View>

        {canLeave && (
          <Button
            label={t('journeyCannotContinue')}
            variant="dangerOutline"
            onPress={onLeave}
            loading={leaveMutation.isPending}
            style={styles.releaseButton}
          />
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { padding: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.md },
    bannerCard: {
      flexDirection: 'row',
      gap: SPACING.xs,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dot: {
      width: SPACING.xxs * 2,
      height: SPACING.xxs * 2,
      borderRadius: SPACING.xxs,
      backgroundColor: colors.primaryGreen,
      marginTop: SPACING.xxs,
    },
    bannerBody: { flex: 1 },
    bannerTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    bannerSubtitle: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2 },
    timerBox: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: TONES.soon.fill,
      borderWidth: 1,
      borderColor: TONES.soon.border,
    },
    timerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
    timerLabelPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs / 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
    },
    timerLabelText: { ...TYPE.caption, fontWeight: '700', color: TONES.soon.fg },
    timerValue: { ...TYPE.title, color: TONES.soon.fg },
    timerBody: { ...TYPE.body, color: colors.textPrimary, lineHeight: 19, marginBottom: SPACING.sm },
    timerButton: { marginTop: SPACING.xxs },
    card: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryText: { ...TYPE.captionStrong, color: colors.textSecondary, marginBottom: SPACING.xxs },
    reportTitle: { ...TYPE.title, color: colors.textPrimary, marginBottom: SPACING.xs },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs, marginBottom: SPACING.sm },
    locationText: { ...TYPE.body, color: colors.textSecondary },
    navigateButton: { marginBottom: SPACING.md },
    divider: { height: 1, backgroundColor: colors.border, marginBottom: SPACING.sm },
    teamLabel: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xs },
    teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
    teamChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 160,
    },
    teamChipText: { ...TYPE.caption, color: colors.textPrimary },
    chatWrap: {},
    releaseButton: { marginTop: SPACING.xs },
  });
