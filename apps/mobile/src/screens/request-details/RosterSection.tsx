import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { acceptRequest, confirmRequest, leaveRequest, type Roster } from '@uthavu/libs-mobile/api/missions';
import type { Report } from '@uthavu/libs-mobile/api/reports';
import { formatTimeRemaining } from '@uthavu/libs-mobile/lib/urgency';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import Button from '@uthavu/libs-mobile/components/Button';

type Props = {
  reportId: string;
  report: Report;
  roster: Roster;
};

// docs/features/accept-and-mission-chat.md US-2/US-3/US-4 — accept, confirm
// within 15 minutes, or leave. All three mutations just refetch the roster
// (and the report, for phone-reveal changes) rather than optimistically
// guessing the new state.
export default function RosterSection({ reportId, report, roster }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roster', reportId] });
    queryClient.invalidateQueries({ queryKey: ['report', reportId] });
  };

  const onError = (e: unknown) => {
    Alert.alert('Could not complete that', e instanceof ApiError ? e.message : 'Try again.');
  };

  const acceptMutation = useMutation({ mutationFn: () => acceptRequest(reportId), onSuccess: invalidate, onError });
  const confirmMutation = useMutation({ mutationFn: () => confirmRequest(reportId), onSuccess: invalidate, onError });
  const leaveMutation = useMutation({
    mutationFn: () => leaveRequest(reportId),
    onSuccess: invalidate,
    onError,
  });

  const activeCount = roster.volunteers.filter((v) => v.status !== 'released').length;
  const isFull = activeCount >= roster.neededVolunteers;

  const onLeave = () => {
    Alert.alert('Leave this mission?', 'You will lose your volunteer slot and another volunteer can join.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveMutation.mutate() },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Volunteers</Text>
        <Text style={styles.count}>
          {activeCount} / {roster.neededVolunteers} joined
        </Text>
      </View>

      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel={`${activeCount} of ${roster.neededVolunteers} volunteers joined`}
        accessibilityValue={{ min: 0, max: roster.neededVolunteers, now: activeCount }}
      >
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(100, (activeCount / roster.neededVolunteers) * 100)}%` },
          ]}
        />
      </View>

      {roster.volunteers.map((v) => (
        <View key={v.id} style={[styles.row, v.status === 'released' && styles.rowReleased]}>
          <Avatar uri={v.avatarUrl} label={v.name} size={32} />
          <Text style={styles.name} numberOfLines={1}>
            {v.name}
          </Text>
          <Text style={styles.status}>
            {v.status === 'active' ? '🟢 Active' : v.status === 'joined' ? '🟡 Joined' : 'Released'}
          </Text>
        </View>
      ))}

      {roster.myStatus === null && !report.isOwner && (
        <Button
          label={isFull ? 'Volunteer limit reached' : "I'll Help"}
          onPress={() => acceptMutation.mutate()}
          disabled={isFull}
          loading={acceptMutation.isPending}
          style={styles.actionButton}
        />
      )}

      {roster.myStatus === 'joined' && (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>
            ⏱ Confirm within {roster.myConfirmDeadline ? formatTimeRemaining(roster.myConfirmDeadline) : '15m'}
          </Text>
          <Button
            label="Start Helping"
            onPress={() => confirmMutation.mutate()}
            loading={confirmMutation.isPending}
            style={styles.actionButton}
          />
          <Button
            label="Leave Mission"
            variant="ghost"
            onPress={onLeave}
            loading={leaveMutation.isPending}
          />
        </View>
      )}

      {roster.myStatus === 'active' && (
        <View style={styles.confirmBox}>
          <Text style={styles.activeText}>🟢 You're helping with this mission.</Text>
          <Button label="Leave Mission" variant="ghost" onPress={onLeave} loading={leaveMutation.isPending} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
    title: { ...TYPE.bodyStrong, color: colors.textPrimary },
    count: { ...TYPE.caption, color: colors.textSecondary },
    progressTrack: {
      height: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginBottom: SPACING.sm,
    },
    progressFill: {
      height: '100%',
      borderRadius: RADIUS.pill,
      backgroundColor: colors.primaryGreen,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.xxs,
    },
    rowReleased: { opacity: 0.5 },
    name: { ...TYPE.body, color: colors.textPrimary, flex: 1 },
    status: { ...TYPE.caption, color: colors.textSecondary },
    actionButton: { marginTop: SPACING.sm },
    confirmBox: { marginTop: SPACING.sm },
    confirmText: { ...TYPE.subheadStrong, color: colors.textPrimary, textAlign: 'center', marginBottom: SPACING.xs },
    activeText: { ...TYPE.subheadStrong, color: colors.primaryGreen, textAlign: 'center' },
  });
