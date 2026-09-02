import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Send } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import {
  getTicket,
  postTicketMessage,
  replyReopens,
  ticketQueryKey,
  TICKETS_QUERY_KEY,
  TICKET_MESSAGE_MAX,
  type TicketAuthor,
  type TicketDetail,
} from '@uthavu/libs-mobile/api/tickets';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import TicketStatusPill from './TicketStatusPill';
import { relativeTimeOrNull, statusTone } from './ticket-display';

type Props = NativeStackScreenProps<RootStackParamList, 'TicketDetail'>;

/** One post in the thread. The opening entry is the ticket's own description. */
type ThreadEntry = {
  key: string;
  body: string;
  author: TicketAuthor;
  createdAt: string;
  isOpening: boolean;
};

const RAIL_WIDTH = 22;
const DOT_SIZE = 10;
/** Distance from the top of an entry to the centre of its dot. */
const DOT_CENTER = 10;

/**
 * Builds the thread the user reads: their original description first, then every
 * reply, oldest to newest.
 *
 * The description is shown as the opening entry so a brand-new ticket already
 * reads as a conversation the user started — nothing is fabricated, it is their
 * own words. It is skipped when the API has already stored that same text as the
 * first message, so a backend that seeds the thread from the description doesn't
 * produce a duplicate.
 */
function buildThread(ticket: TicketDetail): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  const first = ticket.messages[0];
  const descriptionAlreadyInThread =
    first !== undefined && first.body.trim() === ticket.description.trim();

  if (ticket.description.trim() && !descriptionAlreadyInThread) {
    entries.push({
      key: `opening-${ticket.id}`,
      body: ticket.description,
      author: 'user',
      createdAt: ticket.createdAt,
      isOpening: true,
    });
  }

  for (const message of ticket.messages) {
    entries.push({
      key: message.id,
      body: message.body,
      author: message.author,
      createdAt: message.createdAt,
      isOpening: false,
    });
  }

  return entries;
}

// Support Home → a ticket. The conversation itself: what you asked, what support
// said back, where the ticket stands, and — unless it is closed — a way to say
// something else.
export default function TicketDetailScreen({ route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['tickets', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { ticketId, ticketNumber } = route.params;

  const [draft, setDraft] = useState('');
  const [replyError, setReplyError] = useState('');
  const listRef = useRef<FlatList<ThreadEntry>>(null);

  const { data: ticket, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ticketQueryKey(ticketId),
    queryFn: () => getTicket(ticketId),
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => postTicketMessage(ticketId, body),
    onSuccess: (updated) => {
      // The server returns the ticket as it now stands — including a status it
      // may have moved (a reply to a resolved ticket reopens it). Written
      // straight in; the client never decides that for itself.
      queryClient.setQueryData(ticketQueryKey(ticketId), updated);
      queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY });
      setDraft('');
      setReplyError('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    },
    onError: (e) => {
      // A 409 means the ticket closed while this screen was open — refetch so
      // the composer and the status strip stop describing a ticket that no
      // longer exists in that state.
      if (e instanceof ApiError && e.status === 409) refetch();
      setReplyError(e instanceof ApiError ? e.message : t('replyFailed'));
    },
  });

  const headerTitle = t('ticketRef', { number: ticket?.ticketNumber ?? ticketNumber });

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
        <BackHeader title={headerTitle} />
        <View style={styles.skeletonStack}>
          <Skeleton width="100%" height={96} borderRadius={RADIUS.lg} />
          <Skeleton width="85%" height={72} borderRadius={RADIUS.lg} />
          <Skeleton width="70%" height={56} borderRadius={RADIUS.lg} />
        </View>
      </View>
    );
  }

  if (isError || !ticket) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
        <BackHeader title={headerTitle} />
        <ErrorState message={t('loadFailed')} onRetry={refetch} retrying={isFetching} />
      </View>
    );
  }

  const thread = buildThread(ticket);
  const tone = statusTone(ticket.status.key, colors);
  const statusNote = t(`statusNote.${ticket.status.key}`, { defaultValue: '' });
  const opened = relativeTimeOrNull(ticket.createdAt);
  const canReply = ticket.canReply;

  const listHeader = (
    <View>
      <View style={styles.ticketCard}>
        <Text style={styles.subject}>{ticket.subject}</Text>
        <View style={styles.metaRow}>
          {ticket.category?.label ? (
            <Text style={styles.meta} numberOfLines={1}>
              {ticket.category.label}
            </Text>
          ) : null}
          {opened ? <Text style={styles.meta}>{t('openedAgo', { time: opened })}</Text> : null}
        </View>
        <View style={styles.statusRow}>
          <TicketStatusPill status={ticket.status} size="md" />
        </View>
      </View>

      {/* Why the ticket sits where it sits — most of all for waiting_for_user,
          where the user is the one being asked to do something and deserves to
          be told so in words, not just by a red pill. */}
      {statusNote ? (
        <View style={[styles.statusNote, { backgroundColor: tone.fill, borderColor: tone.border }]}>
          <Text style={[styles.statusNoteText, { color: tone.fg }]}>{statusNote}</Text>
        </View>
      ) : null}

      <Text style={styles.threadTitle}>{t('conversationTitle')}</Text>
    </View>
  );

  const renderEntry = ({ item, index }: { item: ThreadEntry; index: number }) => {
    const fromSupport = item.author === 'support';
    const isFirst = index === 0;
    const isLast = index === thread.length - 1;
    const when = relativeTimeOrNull(item.createdAt);
    const authorLabel = fromSupport
      ? t('authorSupport')
      : item.author === 'user'
        ? t('authorYou')
        : null;

    // The rail: one continuous hairline with a dot per entry, so the thread
    // reads as a record in time order rather than as two columns of chat
    // bubbles. Filled dot = support, hollow = you.
    const lineStyle = isFirst && isLast
      ? null
      : isFirst
        ? { top: DOT_CENTER, bottom: 0 }
        : isLast
          ? { top: 0, height: DOT_CENTER }
          : { top: 0, bottom: 0 };

    return (
      <View style={styles.entryRow}>
        <View style={styles.rail}>
          {lineStyle ? <View style={[styles.railLine, lineStyle]} /> : null}
          <View style={[styles.dot, fromSupport ? styles.dotSupport : styles.dotUser]} />
        </View>
        <View style={styles.entryBody}>
          <View style={styles.entryHeader}>
            {authorLabel ? <Text style={styles.entryAuthor}>{authorLabel}</Text> : null}
            {item.isOpening ? <Text style={styles.entryTag}>{t('openingTag')}</Text> : null}
            {when ? <Text style={styles.entryTime}>{when}</Text> : null}
          </View>
          <Text style={styles.entryText}>{item.body}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingTop: insets.top + SPACING.xs }}>
        <BackHeader title={headerTitle} />
      </View>

      {/* The one scroll container; the composer below sits outside it. */}
      <FlatList
        ref={listRef}
        data={thread}
        keyExtractor={(entry) => entry.key}
        renderItem={renderEntry}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<Text style={styles.emptyThread}>{t('emptyThread')}</Text>}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.composer, { paddingBottom: insets.bottom + SPACING.sm }]}>
        {/* Resolved is not closed: the box stays live, and says what a reply
            will do rather than letting it be a surprise. */}
        {canReply && replyReopens(ticket.status.key) ? (
          <Text style={styles.composerNote}>{t('replyReopensNote')}</Text>
        ) : null}
        {!canReply ? (
          <View style={styles.composerLockedNote}>
            <Lock size={ICON_SIZE.xs} color={colors.textSecondary} />
            <Text style={styles.composerLockedText}>{t('replyClosedNote')}</Text>
          </View>
        ) : null}

        <View style={styles.composerRow}>
          {/* A closed ticket disables the box in place — it never silently
              disappears, so the reason above always has something to explain. */}
          <TextInput
            style={[styles.composerInput, !canReply && styles.composerInputDisabled]}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setReplyError('');
            }}
            placeholder={canReply ? t('replyPlaceholder') : t('replyDisabledPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            editable={canReply}
            multiline
            maxLength={TICKET_MESSAGE_MAX}
            accessibilityLabel={t('replyPlaceholder')}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!canReply || !draft.trim() || replyMutation.isPending) && styles.sendButtonDisabled,
            ]}
            onPress={() => replyMutation.mutate(draft.trim())}
            disabled={!canReply || !draft.trim() || replyMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('replySend')}
          >
            <Send size={ICON_SIZE.md} color={colors.textOnTint} />
          </TouchableOpacity>
        </View>

        {replyError ? <Text style={styles.replyError}>{replyError}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    listContent: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.lg },
    skeletonStack: { paddingHorizontal: SIZES.padding, gap: SPACING.sm },

    ticketCard: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.sm,
    },
    subject: { ...TYPE.title, color: colors.textPrimary, lineHeight: 22 },
    metaRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.xxs, flexWrap: 'wrap' },
    meta: { ...TYPE.caption, color: colors.textSecondary },
    statusRow: { marginTop: SPACING.xs },

    statusNote: {
      marginTop: SPACING.xs,
      padding: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
    },
    statusNoteText: { ...TYPE.body, lineHeight: 19 },

    threadTitle: {
      ...TYPE.microLabel,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
    },

    entryRow: { flexDirection: 'row', gap: SPACING.xs },
    rail: { width: RAIL_WIDTH, alignItems: 'center' },
    railLine: {
      position: 'absolute',
      left: (RAIL_WIDTH - 1) / 2,
      width: 1,
      backgroundColor: colors.border,
    },
    dot: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      marginTop: DOT_CENTER - DOT_SIZE / 2,
      borderWidth: 1.5,
    },
    dotSupport: { backgroundColor: colors.primaryGreen, borderColor: colors.primaryGreen },
    dotUser: { backgroundColor: colors.bg, borderColor: colors.border },

    entryBody: { flex: 1, paddingBottom: SPACING.md },
    entryHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' },
    entryAuthor: { ...TYPE.footnote, color: colors.textPrimary },
    entryTag: { ...TYPE.microLabel, color: colors.textSecondary, textTransform: 'uppercase' },
    entryTime: { ...TYPE.caption, color: colors.textSecondary },
    entryText: { ...TYPE.body, color: colors.textSecondary, lineHeight: 19, marginTop: SPACING.xxs },

    emptyThread: { ...TYPE.body, color: colors.textSecondary },

    composer: {
      paddingHorizontal: SIZES.padding,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
      gap: SPACING.xs,
    },
    composerNote: { ...TYPE.caption, color: colors.textSecondary },
    composerLockedNote: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs },
    composerLockedText: { ...TYPE.caption, color: colors.textSecondary, flex: 1, lineHeight: 15 },
    composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.xs },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.sm,
      paddingTop: SPACING.xs + 2,
      paddingBottom: SPACING.xs + 2,
      ...TYPE.subhead,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
    },
    composerInputDisabled: { opacity: 0.5 },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryGreen,
    },
    sendButtonDisabled: { backgroundColor: colors.disabled },
    replyError: { ...TYPE.caption, color: colors.danger },
  });
