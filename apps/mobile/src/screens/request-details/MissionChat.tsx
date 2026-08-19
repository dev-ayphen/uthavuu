import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '../../theme/tokens';
import { listMissionMessages, sendMissionMessage, type MissionMessage } from '../../api/missions';
import TextField from '../../components/TextField';
import Button from '../../components/Button';

type Props = { reportId: string };

// docs/features/accept-and-mission-chat.md US-5/BR-4 — REST poll/refresh
// only, no realtime transport (ADR 0005). Refetches on send; the screen's
// own useFocusEffect (RequestDetailsScreen) covers refresh-on-return.
export default function MissionChat({ reportId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: messages } = useQuery({
    queryKey: ['missionMessages', reportId],
    queryFn: () => listMissionMessages(reportId),
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => sendMissionMessage(reportId, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['missionMessages', reportId], updated);
      setDraft('');
    },
  });

  const onSend = () => {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>💬 Mission Chat</Text>

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
        ListEmptyComponent={<Text style={styles.empty}>No messages yet — say hello.</Text>}
      />

      <View style={styles.composerRow}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          style={styles.input}
          accessibilityLabel="Message"
        />
        <Button label="Send" onPress={onSend} loading={sendMutation.isPending} disabled={!draft.trim()} />
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
    composerRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, alignItems: 'center' },
    input: { flex: 1 },
  });
