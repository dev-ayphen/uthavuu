// docs/features/impact-story.md — renders in place of the active-request
// layout once a report is completed. Reuses RosterSection unchanged for
// "who helped" (it already renders the roster with no action buttons once
// roster.completion exists — see RosterSection.tsx's own myStatus guards).
import { useMemo } from 'react';
import { Alert, Image, Share, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Heart, Share2 } from 'lucide-react-native';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { likeReport, unlikeReport, type Report } from '@uthavu/libs-mobile/api/reports';
import type { Roster } from '@uthavu/libs-mobile/api/missions';
import { formatDuration } from '@uthavu/libs-mobile/lib/time';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Button from '@uthavu/libs-mobile/components/Button';
import RosterSection from './RosterSection';

type Props = {
  reportId: string;
  report: Report;
  roster: Roster;
};

export default function ImpactStorySection({ reportId, report, roster }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const completion = roster.completion;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['report', reportId] });
  const onError = (e: unknown) => {
    Alert.alert(t('couldNotCompleteThat'), e instanceof ApiError ? e.message : t('common:tryAgain'));
  };

  const likeMutation = useMutation({ mutationFn: () => likeReport(reportId), onSuccess: invalidate, onError });
  const unlikeMutation = useMutation({ mutationFn: () => unlikeReport(reportId), onSuccess: invalidate, onError });

  const onToggleLike = () => {
    if (report.likedByMe) unlikeMutation.mutate();
    else likeMutation.mutate();
  };

  const onShare = async () => {
    const link = `uthavu://requests/${reportId}`;
    try {
      await Share.share({
        message: `${t('shareMessage', { title: report.title })} ${link}`,
        url: link,
      });
    } catch {
      // A dismissed/failed share sheet isn't a real error — nothing to surface.
    }
  };

  // Should always be non-null when this component renders (RequestDetailsScreen
  // only mounts it for report.status === 'completed', and a report can't be
  // completed without a mission_completions row) — guarded defensively anyway
  // rather than assuming the two states can never drift apart.
  if (!completion) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.storyLabel}>{t('impactStoryLabel')}</Text>

      <Image source={{ uri: completion.photoUrl }} style={styles.afterPhoto} />

      <Text style={styles.duration}>
        {t('helpedInDuration', { duration: formatDuration(report.createdAt, completion.verifiedAt) })}
      </Text>

      <Text style={styles.caption}>{completion.note}</Text>

      <View style={styles.actionsRow}>
        <Button
          label={String(report.likeCount)}
          icon={
            <Heart
              size={ICON_SIZE.sm}
              color={report.likedByMe ? colors.danger : colors.textSecondary}
              fill={report.likedByMe ? colors.danger : 'none'}
            />
          }
          variant="ghost"
          onPress={onToggleLike}
          loading={likeMutation.isPending || unlikeMutation.isPending}
        />
        <Button
          label={t('share')}
          icon={<Share2 size={ICON_SIZE.sm} color={colors.textSecondary} />}
          variant="ghost"
          onPress={onShare}
        />
      </View>

      <RosterSection reportId={reportId} report={report} roster={roster} />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: { marginTop: SPACING.md },
    storyLabel: { ...TYPE.captionStrong, color: colors.primaryGreen, marginBottom: SPACING.xs },
    afterPhoto: { width: '100%', height: 200, borderRadius: RADIUS.lg, marginBottom: SPACING.sm },
    duration: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xs },
    caption: { ...TYPE.body, color: colors.textSecondary, marginBottom: SPACING.md },
    actionsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  });
