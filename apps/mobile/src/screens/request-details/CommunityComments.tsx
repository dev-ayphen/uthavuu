import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  spam: 'Spam',
  abuse: 'Abuse',
  false_information: 'False information',
  duplicate: 'Duplicate',
  other: 'Other',
};

// docs/PRODUCT-DECISIONS.md Decision 2 — public, unlike Mission Chat
// (MissionChat.tsx): every user who can view this request can read and
// post here, not just the reporter + accepted volunteers. No
// hasActiveAccess-style gating.
export default function CommunityComments({ reportId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

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
      Alert.alert('Comment not posted', e instanceof ApiError ? e.message : 'Try again.');
    },
  });

  const flagMutation = useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason: FlagReason }) =>
      flagComment(reportId, commentId, reason),
    onSuccess: () => {
      Alert.alert('Thanks', "We'll review this.");
    },
    onError: (e) => {
      Alert.alert('Could not flag this', e instanceof ApiError ? e.message : 'Try again.');
    },
  });

  const onSend = () => {
    const body = draft.trim();
    if (!body || postMutation.isPending) return;
    postMutation.mutate(body);
  };

  const onFlag = (commentId: string) => {
    Alert.alert(
      'Flag this comment',
      'What is the issue?',
      [
        ...(Object.entries(FLAG_REASON_LABELS) as [FlagReason, string][]).map(([reason, label]) => ({
          text: label,
          onPress: () => flagMutation.mutate({ commentId, reason }),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>💬 Community Comments</Text>
      <Text style={styles.subtitle}>Public — visible to anyone viewing this request.</Text>

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
                    <Text style={styles.reporterBadgeText}>Reporter</Text>
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
                  accessibilityLabel={`Flag comment from ${item.authorName}`}
                >
                  <Flag size={ICON_SIZE.xs} color={colors.textSecondary} />
                  <Text style={styles.flagButtonText}>Report</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No comments yet — be the first to share something useful.</Text>}
        />
      )}

      <View style={styles.composerRow}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="Share something helpful…"
          style={styles.input}
          accessibilityLabel="Add a comment"
        />
        <Button label="Post" onPress={onSend} loading={postMutation.isPending} disabled={!draft.trim()} />
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
    reporterBadge: {
      backgroundColor: colors.primaryGreenLight,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.xxs,
      paddingVertical: 1,
    },
    reporterBadgeText: { ...TYPE.footnoteRegular, color: colors.primaryGreen },
    time: { ...TYPE.footnoteRegular, color: colors.textSecondary, marginLeft: 'auto' },
    body: { ...TYPE.body, color: colors.textPrimary, marginTop: SPACING.xxs },
    flagButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.xxs, alignSelf: 'flex-start' },
    flagButtonText: { ...TYPE.footnoteRegular, color: colors.textSecondary },
    skeletonRow: { marginBottom: SPACING.xs },
    composerRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, alignItems: 'center' },
    input: { flex: 1 },
  });
