import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { listMissionMessages, sendMissionMessage, type MissionMessage } from '@uthavu/libs-mobile/api/missions';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import TextField from '@uthavu/libs-mobile/components/TextField';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';

type Props = { reportId: string; locked?: boolean };

// docs/features/accept-and-mission-chat.md US-5/BR-4 — REST poll/refresh
// only, no realtime transport (ADR 0005). Refetches on send; the screen's
// own useFocusEffect (RequestDetailsScreen) covers refresh-on-return.
export default function MissionChat({ reportId, locked = false }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: messages, isLoading } = useQuery({
    queryKey: ['missionMessages', reportId],
    queryFn: () => listMissionMessages(reportId),
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMissionMessage(reportId, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['missionMessages', reportId], updated);
      setDraft('');
    },
    // The draft is only cleared on success (above), so a failed send never
    // loses what the user typed — this just makes sure they're told it failed
    // rather than silently doing nothing.
    onError: (e) => {
      Alert.alert(t('messageNotSentTitle'), e instanceof ApiError ? e.message : t('common:tryAgain'));
    },
  });

  const onSend = () => {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('missionChatTitle')}</Text>

      {isLoading ? (
        <View style={styles.list}>
          <Skeleton width="55%" height={32} borderRadius={RADIUS.md} style={styles.skeletonBubbleTheirs} />
          <Skeleton width="45%" height={32} borderRadius={RADIUS.md} style={styles.skeletonBubbleMine} />
        </View>
      ) : (
        <FlatList
          data={messages ?? []}
          keyExtractor={(m) => m.id}
          style={styles.list}
          renderItem={({ item }: { item: MissionMessage }) => (
            <View style={[styles.bubbleRow, item.isMine && styles.bubbleRowMine]}>
              <View style={[styles.bubble, item.isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!item.isMine && <Text style={styles.senderName}>{item.senderName}</Text>}
                <Text style={item.isMine ? styles.bubbleTextMine : styles.bubbleText}>{item.body}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{t('emptyMessages')}</Text>}
        />
      )}

      {locked ? (
        <Text style={styles.lockedNote}>{t('chatLockedNote')}</Text>
      ) : (
        <View style={styles.composerRow}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={t('messagePlaceholder')}
            style={styles.input}
            accessibilityLabel={t('messagePlaceholder')}
          />
          <Button label={t('send')} onPress={onSend} loading={sendMutation.isPending} disabled={!draft.trim()} />
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
    title: { ...TYPE.bodyStrong, color: colors.textPrimary, marginBottom: SPACING.xs },
    list: { maxHeight: 260 },
    empty: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', paddingVertical: SPACING.md },
    bubbleRow: { flexDirection: 'row', marginBottom: SPACING.xs },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '80%', borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
    bubbleTheirs: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    bubbleMine: { backgroundColor: colors.primaryGreen },
    senderName: { ...TYPE.caption, color: colors.textSecondary, marginBottom: 2 },
    bubbleText: { ...TYPE.body, color: colors.textPrimary },
    bubbleTextMine: { ...TYPE.body, color: colors.textOnTint },
    skeletonBubbleTheirs: { marginBottom: SPACING.xs, alignSelf: 'flex-start' },
    skeletonBubbleMine: { alignSelf: 'flex-end' },
    composerRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, alignItems: 'center' },
    input: { flex: 1 },
    lockedNote: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.sm },
  });
