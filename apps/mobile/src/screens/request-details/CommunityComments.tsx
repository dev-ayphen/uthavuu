import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import {
  flagComment,
  listComments,
  postComment,
  type Comment,
  type FlagReason,
} from '@uthavu/libs-mobile/api/comments';
import { getMe } from '@uthavu/libs-mobile/api/users';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import TextField from '@uthavu/libs-mobile/components/TextField';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';

type Props = { reportId: string };

// docs/PRODUCT-DECISIONS.md Decision 2 — public, unlike Mission Chat
// (MissionChat.tsx): every user who can view this request can read and
// post here, not just the reporter + accepted volunteers. No
// hasActiveAccess-style gating.
export default function CommunityComments({ reportId }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const flagReasonLabels: Record<FlagReason, string> = useMemo(
    () => ({
      spam: t('flagReasonSpam'),
      abuse: t('flagReasonAbuse'),
      false_information: t('flagReasonFalseInformation'),
      duplicate: t('flagReasonDuplicate'),
      other: t('flagReasonOther'),
    }),
    [t]
  );

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: comments, isLoading } = useQuery({
    queryKey: ['comments', reportId],
    queryFn: () => listComments(reportId),
  });

  const postMutation = useMutation({
    mutationFn: (body: string) => postComment(reportId, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['comments', reportId], updated);
      setDraft('');
    },
    onError: (e) => {
      Alert.alert(t('commentNotPostedTitle'), e instanceof ApiError ? e.message : t('common:tryAgain'));
    },
  });

  const flagMutation = useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason: FlagReason }) =>
      flagComment(reportId, commentId, reason),
    onSuccess: () => {
      Alert.alert(t('flagThanksTitle'), t('flagThanksMessage'));
    },
    onError: (e) => {
      Alert.alert(t('flagFailedTitle'), e instanceof ApiError ? e.message : t('common:tryAgain'));
    },
  });

  const onSend = () => {
    const body = draft.trim();
    if (!body || postMutation.isPending) return;
    postMutation.mutate(body);
  };

  const onFlag = (commentId: string) => {
    Alert.alert(
      t('flagPromptTitle'),
      t('flagPromptMessage'),
      [
        ...(Object.entries(flagReasonLabels) as [FlagReason, string][]).map(([reason, label]) => ({
          text: label,
          onPress: () => flagMutation.mutate({ commentId, reason }),
        })),
        { text: t('common:cancel'), style: 'cancel' as const },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('communityCommentsTitle')}</Text>
      <Text style={styles.subtitle}>{t('communityCommentsSubtitle')}</Text>

      {isLoading ? (
        <View style={styles.list}>
          <Skeleton width="70%" height={36} borderRadius={RADIUS.md} style={styles.skeletonRow} />
          <Skeleton width="55%" height={36} borderRadius={RADIUS.md} style={styles.skeletonRow} />
        </View>
      ) : (
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          style={styles.list}
          scrollEnabled={false}
          renderItem={({ item }: { item: Comment }) => (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.authorName}>{item.authorName}</Text>
                {item.authorIsReporter && (
                  <View style={styles.reporterBadge}>
                    <Text style={styles.reporterBadgeText}>{t('reporterBadge')}</Text>
                  </View>
                )}
                <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.body}>{item.body}</Text>
              {me && item.authorId !== me.id && (
                <TouchableOpacity
                  style={styles.flagButton}
                  onPress={() => onFlag(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('flagAccessibilityLabel', { name: item.authorName })}
                >
                  <Flag size={ICON_SIZE.xs} color={colors.textSecondary} />
                  <Text style={styles.flagButtonText}>{t('flagAction')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{t('emptyComments')}</Text>}
        />
      )}

      <View style={styles.composerRow}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder={t('commentPlaceholder')}
          style={styles.input}
          accessibilityLabel={t('commentPlaceholder')}
        />
        <Button label={t('post')} onPress={onSend} loading={postMutation.isPending} disabled={!draft.trim()} />
      </View>
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
    title: { ...TYPE.bodyStrong, color: colors.textPrimary },
    subtitle: { ...TYPE.caption, color: colors.textSecondary, marginBottom: SPACING.xs },
    list: { marginTop: SPACING.xs },
    empty: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: SPACING.md },
    row: { paddingVertical: SPACING.xs, borderTopWidth: 1, borderTopColor: colors.border },
    rowHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs },
    authorName: { ...TYPE.captionStrong, color: colors.textPrimary },
    // paddingVertical below the SPACING scale's floor (xxs=4) is deliberate —
    // this badge sits inline with footnote-sized text and needs to stay
    // visually flush with it; SPACING.xxs here would make it noticeably taller
    // than the text next to it.
    reporterBadge: {
      backgroundColor: colors.primaryGreenLight,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.xxs,
      paddingVertical: 1,
    },
    reporterBadgeText: { ...TYPE.footnoteRegular, color: colors.primaryGreen },
    time: { ...TYPE.footnoteRegular, color: colors.textSecondary, marginLeft: 'auto' },
    body: { ...TYPE.body, color: colors.textPrimary, marginTop: SPACING.xxs },
    flagButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      marginTop: SPACING.xxs,
      alignSelf: 'flex-start',
    },
    flagButtonText: { ...TYPE.footnoteRegular, color: colors.textSecondary },
    skeletonRow: { marginBottom: SPACING.xs },
    composerRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, alignItems: 'center' },
    input: { flex: 1 },
  });
