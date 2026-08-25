import { useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Clock, MapPin, Navigation, UserCheck, XCircle } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getReport } from '@uthavu/libs-mobile/api/reports';
import {
  confirmRequest,
  getRoster,
  leaveRequest,
  updateMissionProgress,
  type ProgressStatus,
} from '@uthavu/libs-mobile/api/missions';
import { formatTimeRemaining } from '@uthavu/libs-mobile/lib/urgency';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import Button from '@uthavu/libs-mobile/components/Button';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import RequestDetailsSkeleton from './RequestDetailsSkeleton';
import MissionChat from './MissionChat';
import CompleteMissionSheet from './CompleteMissionSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'VolunteerJourney'>;

export default function VolunteerJourneyScreen({ route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const queryClient = useQueryClient();

  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);

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
  const progressMutation = useMutation({
    mutationFn: (status: ProgressStatus) => updateMissionProgress(reportId, status),
    onSuccess: invalidate,
    onError,
  });

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
  const isCompleted = report.status === 'completed';

  return (
    <View style={styles.root}>
      <BackHeader title={t('volunteerJourneyTitle')} style={{ paddingTop: insets.top + SPACING.xs }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ① Status Banner */}
        {isCompleted ? (
          <View style={[styles.bannerCard, styles.bannerCompleted]}>
            <CheckCircle2 size={20} color="#15803D" />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: '#15803D' }]}>Mission Completed ✅</Text>
              <Text style={styles.bannerSubtitle}>
                {roster.completion
                  ? `Completed on ${new Date(roster.completion.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Thank you for helping your community!'}
              </Text>
            </View>
          </View>
        ) : roster.myStatus === 'joined' ? (
          <View style={styles.bannerCard}>
            <View style={styles.dot} />
            <View style={styles.bannerBody}>
              <Text style={styles.bannerTitle}>Volunteer Joined</Text>
              <Text style={styles.bannerSubtitle}>You joined this request. Confirm within 15 minutes.</Text>
            </View>
          </View>
        ) : roster.myStatus === 'active' ? (
          <View style={[styles.bannerCard, styles.bannerActive]}>
            <View style={[styles.dot, { backgroundColor: colors.primaryGreen }]} />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: colors.primaryGreen }]}>🟢 You Are Helping</Text>
              <Text style={styles.bannerSubtitle}>Mission Active — coordinate with your team below.</Text>
            </View>
          </View>
        ) : null}

        {/* ② 15-Minute Confirmation Timer (when status === 'joined') */}
        {roster.myStatus === 'joined' && !isCompleted && (
          <View style={styles.timerBox}>
            <View style={styles.timerHeaderRow}>
              <View style={styles.timerLabelPill}>
                <Clock size={ICON_SIZE.xs} color={TONES.soon.fg} />
                <Text style={styles.timerLabelText}>⏱ Response Window</Text>
              </View>
              {roster.myConfirmDeadline && (
                <Text style={styles.timerValue}>{formatTimeRemaining(roster.myConfirmDeadline)}</Text>
              )}
            </View>
            <Text style={styles.timerBody}>You have 15 minutes to confirm and start helping.</Text>
            <Button
              label={t('startHelping')}
              onPress={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              style={styles.timerButton}
            />
          </View>
        )}

        {/* ③ Mission Details Card */}
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

          {/* ④ Mission Team */}
          <View style={styles.teamHeaderRow}>
            <Text style={styles.teamLabel}>
              Mission Team ({activeCount} / {roster.neededVolunteers})
            </Text>
          </View>

          <View style={styles.teamRow}>
            {report.reporter && (
              <View style={[styles.teamChip, styles.teamChipReporter]}>
                <Avatar uri={report.reporter.avatarUrl} label={report.reporter.name} size={22} />
                <Text style={styles.teamChipText} numberOfLines={1}>
                  {report.reporter.name} (Reporter)
                </Text>
              </View>
            )}
            {report.reporterDeleted && (
              <View style={[styles.teamChip, styles.teamChipReporter]}>
                <Avatar uri={null} label={t('deletedUserLabel')} size={22} />
                <Text style={styles.teamChipText} numberOfLines={1}>
                  {t('deletedUserLabel')} (Reporter)
                </Text>
              </View>
            )}
            {roster.volunteers.map((v) => (
              <View key={v.id} style={[styles.teamChip, v.status === 'released' && styles.teamChipReleased]}>
                <Avatar uri={v.volunteerDeleted ? null : v.avatarUrl} label={v.volunteerDeleted ? t('deletedUserLabel') : v.name} size={22} />
                <Text style={styles.teamChipText} numberOfLines={1}>
                  {v.volunteerDeleted ? t('deletedUserLabel') : v.name}{' '}
                  {v.status === 'active'
                    ? `🟢${v.progressStatus ? ` ${v.progressStatus.label}` : ''}`
                    : v.status === 'released'
                      ? '(Left)'
                      : '(Joined)'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ⑤ Progress Status Update — real, server-persisted, visible to the
            whole team (not local-only UI state) */}
        {roster.myStatus === 'active' && !isCompleted && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('journeyProgressTitle')}</Text>
            <View style={styles.statusChipsRow}>
              {(
                [
                  { key: 'on_the_way', emoji: '🚗', label: t('journeyProgressOnWay') },
                  { key: 'reached_location', emoji: '📍', label: t('journeyProgressReached') },
                  { key: 'helping_now', emoji: '🤝', label: t('journeyProgressHelping') },
                ] as const
              ).map((option) => {
                const active = roster.myProgressStatus?.key === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.statusChip, active && styles.statusChipActive]}
                    onPress={() => progressMutation.mutate(option.key)}
                    disabled={progressMutation.isPending}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                      {option.emoji} {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ⑥ Temporary Mission Chat */}
        <View style={styles.chatWrap}>
          <MissionChat reportId={reportId} locked={isCompleted} />
        </View>

        {/* ⑦ Mission Completion Notes (if completed) */}
        {isCompleted && roster.completion && (
          <View style={styles.completionNoteBox}>
            <Text style={styles.completionNoteTitle}>Completion Report</Text>
            <Text style={styles.completionNoteText}>"{roster.completion.note}"</Text>
          </View>
        )}

        {/* ⑧ Action Buttons: Complete Mission & Leave Mission */}
        {roster.myStatus === 'active' && !isCompleted && (
          <View style={styles.actionsStack}>
            <Button
              label={t('completeMission')}
              onPress={() => setCompleteSheetOpen(true)}
              style={styles.completeBtn}
            />
            {canLeave && (
              <Button
                label={t('journeyCannotContinue')}
                variant="dangerOutline"
                onPress={onLeave}
                loading={leaveMutation.isPending}
              />
            )}
          </View>
        )}

        {roster.myStatus === 'joined' && canLeave && (
          <Button
            label={t('journeyCannotContinue')}
            variant="dangerOutline"
            onPress={onLeave}
            loading={leaveMutation.isPending}
            style={styles.releaseButton}
          />
        )}
      </ScrollView>

      {/* Complete Mission Sheet */}
      <CompleteMissionSheet
        visible={completeSheetOpen}
        reportId={reportId}
        onClose={() => setCompleteSheetOpen(false)}
        onComplete={() => {
          setCompleteSheetOpen(false);
          invalidate();
        }}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { padding: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.md },

    bannerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bannerActive: {
      backgroundColor: colors.primaryGreenLight,
      borderColor: colors.primaryGreen,
    },
    bannerCompleted: {
      backgroundColor: '#DCFCE7',
      borderColor: '#BBF7D0',
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: TONES.soon.fg,
    },
    bannerBody: { flex: 1 },
    bannerTitle: { ...TYPE.bodyStrong, color: colors.textPrimary, fontWeight: '800' },
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

    teamHeaderRow: { marginBottom: SPACING.xs },
    teamLabel: { ...TYPE.subheadStrong, color: colors.textPrimary },
    teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
    teamChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    teamChipReporter: {
      backgroundColor: colors.primaryGreenLight,
      borderColor: colors.primaryGreen,
    },
    teamChipReleased: { opacity: 0.5 },
    teamChipText: { ...TYPE.caption, color: colors.textPrimary, fontWeight: '600' },

    sectionTitle: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xs },
    statusChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.xxs },
    statusChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusChipActive: {
      backgroundColor: colors.primaryGreenLight,
      borderColor: colors.primaryGreen,
    },
    statusChipText: { ...TYPE.caption, color: colors.textSecondary, fontWeight: '600' },
    statusChipTextActive: { color: colors.primaryGreen, fontWeight: '800' },

    chatWrap: {},
    completionNoteBox: {
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    completionNoteTitle: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xxs },
    completionNoteText: { ...TYPE.body, color: colors.textSecondary, fontStyle: 'italic' },

    actionsStack: { gap: SPACING.xs },
    completeBtn: { marginBottom: 2 },
    releaseButton: { marginTop: SPACING.xs },
  });
