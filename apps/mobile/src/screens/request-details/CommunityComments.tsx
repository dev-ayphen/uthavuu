import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Send, Flag, MessageSquare } from 'lucide-react-native';
import { TextInput } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
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
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';

type Props = { reportId: string };

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
    <View style={styles.section}>
      {/* ── Section Header ── */}
      <View style={styles.headerRow}>
        <MessageSquare size={16} color={colors.textPrimary} style={styles.headerIcon} />
        <Text style={styles.title}>{t('communityCommentsTitle')}</Text>
      </View>

      {/* ── Comment List ── */}
      {isLoading ? (
        <View style={styles.list}>
          <Skeleton width="70%" height={32} borderRadius={RADIUS.md} style={styles.skeletonRow} />
          <Skeleton width="55%" height={32} borderRadius={RADIUS.md} style={styles.skeletonRow} />
        </View>
      ) : (comments ?? []).length === 0 ? (
        <Text style={styles.empty}>{t('emptyComments')}</Text>
      ) : (
        <View style={styles.list}>
          {(comments ?? []).map((item: Comment, idx: number) => (
            <View key={item.id} style={[styles.row, idx === 0 && styles.firstRow]}>
              <View style={styles.rowHeader}>
                <View style={styles.nameGroup}>
                  <Text style={styles.authorName} numberOfLines={1}>
                    {item.authorDeleted ? t('deletedUserLabel') : item.authorName}
                  </Text>
                  {item.authorIsReporter && (
                    <View style={styles.reporterBadge}>
                      <Text style={styles.reporterBadgeText}>{t('reporterBadge')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.body}>{item.body}</Text>
              {me && item.authorId !== me.id && (
                <TouchableOpacity
                  style={styles.flagButton}
                  onPress={() => onFlag(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('flagAccessibilityLabel', {
                    name: item.authorDeleted ? t('deletedUserLabel') : item.authorName,
                  })}
                >
                  <Flag size={ICON_SIZE.xs} color={colors.textSecondary} />
                  <Text style={styles.flagButtonText}>{t('flagAction')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* ── Composer ── */}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('commentPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          accessibilityLabel={t('commentPlaceholder')}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || postMutation.isPending) && styles.sendOff]}
          onPress={onSend}
          disabled={!draft.trim() || postMutation.isPending}
          accessibilityRole="button"
        >
          <Send size={14} color={draft.trim() ? '#FFF' : colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    section: {
      marginTop: SPACING.sm,
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: SPACING.xs,
    },
    headerIcon: {
      marginRight: 2,
    },
    headerTextGroup: { flex: 1 },
    title: { ...TYPE.bodyStrong, color: colors.textPrimary },
    subtitle: { ...TYPE.caption, color: colors.textSecondary, marginTop: 1 },
    list: { marginTop: 2 },
    empty: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: SPACING.xs },
    row: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
    firstRow: { borderTopWidth: 0, paddingTop: 0 },
    rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    nameGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6 },
    authorName: { ...TYPE.captionStrong, color: colors.textPrimary, flexShrink: 1 },
    reporterBadge: {
      backgroundColor: colors.primaryGreenLight,
      borderRadius: RADIUS.sm,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    reporterBadgeText: { ...TYPE.caption, fontSize: 10, color: colors.primaryGreen, fontWeight: '600' },
    time: { ...TYPE.caption, color: colors.textSecondary },
    body: { ...TYPE.body, color: colors.textPrimary, marginTop: 2 },
    flagButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 3,
      alignSelf: 'flex-start',
    },
    flagButtonText: { ...TYPE.caption, color: colors.textSecondary },
    skeletonRow: { marginBottom: 4 },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: SPACING.xs,
    },
    input: {
      flex: 1,
      height: 36,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.sm,
      ...TYPE.footnoteRegular,
      color: colors.textPrimary,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.primaryGreen,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendOff: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
