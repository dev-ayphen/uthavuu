// docs/features/impact-story.md — renders in place of the active-request
// layout once a report is completed. Reuses RosterSection unchanged for
// "who helped" (it already renders the roster with no action buttons once
// roster.completion exists — see RosterSection.tsx's own myStatus guards).
// Deliberately no Like button — Impact Stories show community impact, not
// social-media engagement; Save (a personal "read later" bookmark) and
// Share stay, Like doesn't.
import { useMemo } from 'react';
import { Alert, Image, Share, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bookmark, BookmarkCheck, Share2 } from 'lucide-react-native';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { saveReport, unsaveReport, type Report } from '@uthavu/libs-mobile/api/reports';
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

  const saveMutation = useMutation({ mutationFn: () => saveReport(reportId), onSuccess: invalidate, onError });
  const unsaveMutation = useMutation({ mutationFn: () => unsaveReport(reportId), onSuccess: invalidate, onError });

  const onToggleSave = () => {
    if (report.savedByMe) unsaveMutation.mutate();
    else saveMutation.mutate();
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

  // report.photos[0] is the reporter's original photo (read-only here — this
  // screen never edits or re-uploads it, just references the existing
  // report photo); completion.photoUrl is the volunteer's verified
  // after-photo. Show both side by side when both exist; fall back to
  // whichever one is actually available rather than fabricating a
  // placeholder for the missing side.
  const beforePhoto = report.photos[0];
  const afterPhoto = completion.photoUrl;

  return (
    <View style={styles.container}>
      <Text style={styles.storyLabel}>{t('impactStoryLabel')}</Text>

      {beforePhoto && afterPhoto ? (
        <View style={styles.beforeAfterRow}>
          <View style={styles.photoColumn}>
            <Image source={{ uri: beforePhoto }} style={styles.comparisonPhoto} />
            <Text style={styles.photoLabel}>{t('beforeLabel')}</Text>
          </View>
          <View style={styles.photoColumn}>
            <Image source={{ uri: afterPhoto }} style={styles.comparisonPhoto} />
            <Text style={styles.photoLabel}>{t('afterLabel')}</Text>
          </View>
        </View>
      ) : (
        (afterPhoto ?? beforePhoto) && (
          <Image source={{ uri: afterPhoto ?? beforePhoto }} style={styles.afterPhoto} />
        )
      )}

      <Text style={styles.duration}>
        {t('helpedInDuration', { duration: formatDuration(report.createdAt, completion.verifiedAt) })}
      </Text>

      <Text style={styles.caption}>{completion.note}</Text>

      <View style={styles.actionsRow}>
        <Button
          label={t('share')}
          icon={<Share2 size={ICON_SIZE.sm} color={colors.textSecondary} />}
          variant="ghost"
          onPress={onShare}
        />
        <Button
          label={report.savedByMe ? t('saved') : t('save')}
          icon={
            report.savedByMe ? (
              <BookmarkCheck size={ICON_SIZE.sm} color={colors.primaryGreen} fill={colors.primaryGreen} />
            ) : (
              <Bookmark size={ICON_SIZE.sm} color={colors.textSecondary} />
            )
          }
          variant="ghost"
          onPress={onToggleSave}
          loading={saveMutation.isPending || unsaveMutation.isPending}
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
    beforeAfterRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
    photoColumn: { flex: 1, alignItems: 'center', gap: SPACING.xxs },
    comparisonPhoto: { width: '100%', height: 140, borderRadius: RADIUS.lg },
    photoLabel: { ...TYPE.captionStrong, color: colors.textSecondary },
    duration: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xs },
    caption: { ...TYPE.body, color: colors.textSecondary, marginBottom: SPACING.md },
    actionsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  });
