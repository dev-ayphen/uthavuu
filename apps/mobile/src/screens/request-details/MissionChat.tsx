import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Lock, MessageSquare, Send } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { listMissionMessages, sendMissionMessage, type MissionMessage } from '@uthavu/libs-mobile/api/missions';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';

type Props = { reportId: string; locked?: boolean };

export default function MissionChat({ reportId, locked = false }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  // Mission Chat is REST poll/send — there is no realtime transport in this
  // product (CLAUDE.md § App Profile, Realtime: none). Without an interval the
  // thread only updated when the whole screen remounted, so two people
  // coordinating an emergency each sat looking at their own last message.
  //
  // Polling stops once the mission is complete: `locked` means the server has
  // already made the thread read-only, so there is nothing new to fetch and no
  // reason to keep a timer alive behind a finished mission.
  const { data: messages, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['missionMessages', reportId],
    queryFn: () => listMissionMessages(reportId),
    refetchInterval: locked ? false : 15_000,
    refetchOnWindowFocus: !locked,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMissionMessage(reportId, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['missionMessages', reportId], updated);
      setDraft('');
    },
    onError: (e) => {
      Alert.alert(t('messageNotSentTitle'), e instanceof ApiError ? e.message : t('common:tryAgain'));
    },
  });

  const onSend = () => {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  };

  const count = (messages ?? []).length;

  return (
    <View style={styles.section}>
      {/* ── Section Header ── */}
      <View style={styles.headerRow}>
        <MessageSquare size={16} color={colors.textPrimary} style={styles.headerIcon} />
        <Text style={styles.title}>{t('missionChatTitle')}</Text>
      </View>

      {/* ── Body ── */}
      {isLoading ? (
        <View style={styles.bubbleList}>
          <Skeleton width="60%" height={28} borderRadius={RADIUS.md} style={styles.skLeft} />
          <Skeleton width="45%" height={28} borderRadius={RADIUS.md} style={styles.skRight} />
        </View>
      ) : isError && !messages ? (
        /*
         * loading → error → empty → content. The error arm has to come BEFORE
         * the empty one: a failed fetch leaves `messages` undefined, so
         * `count === 0` was true and a dead connection rendered "No messages
         * yet — say hello." On a private channel two people are using to find
         * each other in an emergency, silence and failure must not look alike.
         */
        <View style={styles.errorRow}>
          <Text style={styles.emptyHint}>{t('common:somethingWentWrong')}</Text>
          <TouchableOpacity
            onPress={() => void refetch()}
            disabled={isFetching}
            accessibilityRole="button"
            accessibilityLabel={t('common:retry')}
          >
            <Text style={[styles.retryText, isFetching && styles.retryOff]}>
              {isFetching ? t('common:loading') : t('common:retry')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : count === 0 ? (
        <Text style={styles.emptyHint}>{t('emptyMessages')}</Text>
      ) : (
        <View style={styles.bubbleList}>
          {(messages ?? []).map((m: MissionMessage) => (
            <View key={m.id} style={[styles.bRow, m.isMine && styles.bRowMine]}>
              <View style={[styles.bubble, m.isMine ? styles.bMine : styles.bTheirs]}>
                {!m.isMine && (
                  <Text style={styles.bSender}>{m.senderDeleted ? t('deletedUserLabel') : m.senderName}</Text>
                )}
                <Text style={m.isMine ? styles.bTextMine : styles.bText}>{m.body}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Composer / Locked ── */}
      {locked ? (
        <View style={styles.lockedRow}>
          <Lock size={12} color={colors.textSecondary} />
          <Text style={styles.lockedText}>{t('chatLockedNote')}</Text>
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('messagePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            accessibilityLabel={t('messagePlaceholder')}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sendMutation.isPending) && styles.sendOff]}
            onPress={onSend}
            disabled={!draft.trim() || sendMutation.isPending}
            accessibilityRole="button"
          >
            <Send size={14} color={draft.trim() ? '#FFF' : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
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
    title: {
      ...TYPE.bodyStrong,
      color: colors.textPrimary,
    },
    bubbleList: { gap: 6 },
    bRow: { flexDirection: 'row' },
    bRowMine: { justifyContent: 'flex-end' },
    bubble: {
      maxWidth: '82%',
      borderRadius: RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    bTheirs: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    bMine: { backgroundColor: COLORS.primaryGreen },
    bSender: { ...TYPE.caption, color: colors.textSecondary, marginBottom: 1 },
    bText: { ...TYPE.body, color: colors.textPrimary },
    bTextMine: { ...TYPE.body, color: COLORS.textOnTint },
    skLeft: { alignSelf: 'flex-start', marginBottom: 4 },
    skRight: { alignSelf: 'flex-end' },
    emptyHint: {
      ...TYPE.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: SPACING.xs,
    },
    errorRow: {
      alignItems: 'center',
      gap: 2,
      paddingVertical: SPACING.xs,
    },
    retryText: {
      ...TYPE.captionStrong,
      color: colors.primaryGreen,
    },
    retryOff: { opacity: 0.5 },
    lockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginTop: SPACING.xs,
      paddingTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    lockedText: { ...TYPE.caption, color: colors.textSecondary },
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
