import { useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Clock, MapPin, Navigation, Phone, UserCheck, XCircle } from 'lucide-react-native';
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
import { Divider } from '@uthavu/libs-mobile/components';
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

  const onCallReporter = () => {
    const phone = report?.reporterPhone;
    if (!phone) return;
    // `tel:` rather than a dialogue asking to copy the number: this is an
    // emergency-help product, and the volunteer is already on their way.
    // A handset with no dialler (a tablet) simply fails to open, which is why
    // the rejection is swallowed rather than surfaced as an error.
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
  };

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
            <View style={styles.completedBadgeIcon}>
              <CheckCircle2 size={22} color="#15803D" />
            </View>
            <View style={styles.bannerBody}>
              <View style={styles.bannerHeaderTitleRow}>
                <Text style={[styles.bannerTitle, { color: '#15803D' }]}>{t('journeyCompletedTitle')}</Text>
                <View style={styles.completedCheckTag}>
                  <Text style={styles.completedCheckTagText}>✓</Text>
                </View>
              </View>
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
              <Text style={styles.bannerTitle}>{t('journeyJoinedBannerTitle')}</Text>
              <Text style={styles.bannerSubtitle}>{t('journeyJoinedSubtitle')}</Text>
            </View>
          </View>
        ) : roster.myStatus === 'active' ? (
          <View style={[styles.bannerCard, styles.bannerActive]}>
            <View style={[styles.dot, { backgroundColor: colors.primaryGreen }]} />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: colors.primaryGreen }]}>{t('journeyHelpingTitle')}</Text>
              <Text style={styles.bannerSubtitle}>{t('journeyHelpingSubtitle')}</Text>
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
            <Text style={styles.timerBody}>{t('journeyTimerBody')}</Text>
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
          <View style={styles.categoryPillHeader}>
            <Text style={styles.categoryText}>
              {report.category.emoji} {report.category.label}
            </Text>
          </View>
          <Text style={styles.reportTitle}>{report.title}</Text>
          {report.landmark && (
            <View style={styles.locationRow}>
              <MapPin size={16} color={colors.textSecondary} />
              <Text style={styles.locationText}>{report.landmark}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.navGoogleBtn} onPress={onNavigate} activeOpacity={0.8}>
            <Navigation size={18} color={colors.primaryGreen} />
            <Text style={styles.navGoogleBtnText}>{t('journeyNavigateViaMaps')}</Text>
          </TouchableOpacity>

          {/* THE PHONE REVEAL — the other half of "Accept unlocks the reporter's
              contact", which until now had a server and no client.
              `reporterPhone` was declared in the mobile Report type and read by
              nothing: a reporter who ticked "share my number with volunteers"
              shared it with nobody.

              THE GATE IS THE SERVER'S, NOT THIS CONDITION. `reporterPhone` is
              null unless the caller is the reporter, or an active volunteer AND
              the reporter opted in (reports.service.ts toResponse). Rendering
              on its presence means this button cannot show a number the API
              declined to send — and cannot be made to by editing client state.
              Do not add a `phoneVisible` check here; that would duplicate half
              the rule and let the two drift. */}
          {report.reporterPhone && (
            <TouchableOpacity
              style={styles.navGoogleBtn}
              onPress={onCallReporter}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Phone size={18} color={colors.primaryGreen} />
              <Text style={styles.navGoogleBtnText}>{t('journeyCallReporter')}</Text>
            </TouchableOpacity>
          )}

          <Divider style={styles.divider} />

          {/* ④ Mission Team */}
          <View style={styles.teamHeaderRow}>
            <Text style={styles.teamLabel}>
              Mission Team ({activeCount} / {roster.neededVolunteers})
            </Text>
          </View>

          <View style={styles.teamRow}>
            {report.reporter && (
              <View style={[styles.teamChip, styles.teamChipReporter]}>
                <Avatar uri={report.reporter.avatarUrl} label={report.reporter.name} size={20} />
                <Text style={styles.teamChipTextReporter} numberOfLines={1}>
                  {report.reporter.name} (Reporter)
                </Text>
              </View>
            )}
            {report.reporterDeleted && (
              <View style={[styles.teamChip, styles.teamChipReporter]}>
                <Avatar uri={null} label={t('deletedUserLabel')} size={20} />
                <Text style={styles.teamChipTextReporter} numberOfLines={1}>
                  {t('deletedUserLabel')} (Reporter)
                </Text>
              </View>
            )}
            {roster.volunteers
              .filter((v) => !report.reporter || v.name !== report.reporter.name)
              .map((v) => (
                <View key={v.id} style={[styles.teamChip, v.status === 'released' && styles.teamChipReleased]}>
                  <Avatar uri={v.volunteerDeleted ? null : v.avatarUrl} label={v.volunteerDeleted ? t('deletedUserLabel') : v.name} size={20} />
                  <Text style={[styles.teamChipText, v.status === 'released' && styles.teamChipTextReleased]} numberOfLines={1}>
                    {v.volunteerDeleted ? t('deletedUserLabel') : v.name}
                    {v.status === 'released' ? ' (Left)' : ''}
                  </Text>
                  {v.status === 'active' && <View style={styles.activeVolDot} />}
                </View>
              ))}
          </View>
        </View>

        {/* ⑤ Progress Status Update */}
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
            <Text style={styles.completionNoteTitle}>{t('completionReportTitle')}</Text>
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
      gap: SPACING.sm,
      padding: SPACING.md,
      borderRadius: RADIUS.xl,
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
      borderColor: '#86EFAC',
      borderWidth: 1,
    },
    completedBadgeIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerHeaderTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    completedCheckTag: {
      backgroundColor: '#16A34A',
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    completedCheckTagText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '900',
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
      borderRadius: RADIUS.xl,
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
      borderRadius: RADIUS.xl,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryPillHeader: {
      alignSelf: 'flex-start',
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.xs,
    },
    categoryText: { ...TYPE.captionStrong, color: colors.textSecondary },
    reportTitle: { ...TYPE.title, color: colors.textPrimary, fontSize: 18, lineHeight: 24, marginBottom: SPACING.xs },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.md },
    locationText: { ...TYPE.body, color: colors.textSecondary },
    navGoogleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      marginBottom: SPACING.md,
    },
    navGoogleBtnText: {
      ...TYPE.bodyStrong,
      color: colors.textPrimary,
    },
    // Only the asymmetric margin remains local; the rule itself is <Divider>.
    divider: { marginBottom: SPACING.md },

    teamHeaderRow: { marginBottom: SPACING.sm },
    teamLabel: { ...TYPE.subheadStrong, color: colors.textPrimary },
    teamRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    teamChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    teamChipReporter: {
      backgroundColor: colors.primaryGreenLight,
      borderColor: colors.primaryGreen,
    },
    teamChipReleased: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      opacity: 0.7,
    },
    teamChipTextReporter: { ...TYPE.captionStrong, color: colors.primaryGreen },
    teamChipText: { ...TYPE.captionStrong, color: colors.textPrimary },
    teamChipTextReleased: { color: colors.textSecondary, fontWeight: '400' },
    activeVolDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primaryGreen,
      marginLeft: 2,
    },

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
      borderRadius: RADIUS.xl,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    completionNoteTitle: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: 4 },
    completionNoteText: { ...TYPE.body, color: colors.textSecondary, fontStyle: 'italic' },

    actionsStack: { gap: SPACING.xs },
    completeBtn: { marginBottom: 2 },
    releaseButton: { marginTop: SPACING.xs },
  });
