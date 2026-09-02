import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, LifeBuoy, PlusCircle, Search, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TOUCH_TARGET, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import {
  isOpenStatus,
  listMyTickets,
  TICKETS_QUERY_KEY,
  type Ticket,
} from '@uthavu/libs-mobile/api/tickets';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import EmptyState from '@uthavu/libs-mobile/components/EmptyState';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import TicketStatusPill from './TicketStatusPill';
import { relativeTimeOrNull, statusLabel } from './ticket-display';
import { FAQ_ICONS, FAQ_IDS, type FaqId } from './support-faq';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * `open` is everything that is not resolved or closed, so a status this build
 * has never seen still lands somewhere instead of vanishing. `resolved` covers
 * both finished states — a closed ticket is not gone, and its row still says
 * "Closed" on its own pill, which is where that distinction actually matters.
 */
type TicketFilter = 'all' | 'open' | 'resolved';
const FILTERS: readonly TicketFilter[] = ['all', 'open', 'resolved'];

// Profile → Help & Support. The whole point of this screen: Help & Support is a
// place you come back to, not a form you fire and forget. Submitting is one
// action among several here, and every ticket you have ever opened stays on
// this list with its current status and when it last moved.
export default function SupportHomeScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation(['tickets', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TicketFilter>('all');
  const [openFaq, setOpenFaq] = useState<FaqId | null>(null);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: TICKETS_QUERY_KEY,
    queryFn: listMyTickets,
  });

  const tickets = useMemo(() => data ?? [], [data]);
  const search = query.trim().toLowerCase();

  const counts = useMemo(
    () => ({
      all: tickets.length,
      open: tickets.filter((ticket) => isOpenStatus(ticket.status.key)).length,
      resolved: tickets.filter((ticket) => !isOpenStatus(ticket.status.key)).length,
    }),
    [tickets]
  );

  const visibleTickets = useMemo(() => {
    const byFilter = tickets.filter((ticket) => {
      if (filter === 'open') return isOpenStatus(ticket.status.key);
      if (filter === 'resolved') return !isOpenStatus(ticket.status.key);
      return true;
    });
    if (!search) return byFilter;
    return byFilter.filter(
      (ticket) =>
        ticket.subject.toLowerCase().includes(search) ||
        ticket.ticketNumber.toLowerCase().includes(search)
    );
  }, [tickets, filter, search]);

  // One search box over both halves of the screen: the answer you need may
  // already be in the FAQ, and if it isn't, the ticket you filed about it is
  // right below.
  const visibleFaqs = useMemo(() => {
    if (!search) return FAQ_IDS;
    return FAQ_IDS.filter((id) => {
      const question = t(`faq.${id}.question`).toLowerCase();
      const answer = t(`faq.${id}.answer`).toLowerCase();
      return question.includes(search) || answer.includes(search);
    });
  }, [search, t]);

  const goToSubmit = () => navigation.navigate('SubmitTicket');

  const listHeader = (
    <View>
      <View style={styles.searchBox}>
        <Search size={ICON_SIZE.sm} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('searchPlaceholder')}
        />
        {query.length > 0 ? (
          <TouchableOpacity
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel={t('searchClear')}
            hitSlop={SPACING.xs}
          >
            <X size={ICON_SIZE.sm} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.submitCta}
        onPress={goToSubmit}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={t('submitCtaTitle')}
      >
        <View style={styles.submitCtaIcon}>
          <PlusCircle size={ICON_SIZE.md} color={colors.textOnTint} />
        </View>
        <View style={styles.submitCtaBody}>
          <Text style={styles.submitCtaTitle}>{t('submitCtaTitle')}</Text>
          <Text style={styles.submitCtaSubtitle}>{t('submitCtaSubtitle')}</Text>
        </View>
        <ChevronRight size={ICON_SIZE.md} color={colors.textOnTint} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>{t('faqTitle')}</Text>
      {visibleFaqs.length === 0 ? (
        <Text style={styles.faqNoMatches}>{t('faqNoMatches', { query: query.trim() })}</Text>
      ) : (
        <View style={styles.faqCard}>
          {visibleFaqs.map((id, index) => {
            const Icon = FAQ_ICONS[id];
            const expanded = openFaq === id;
            return (
              <View key={id}>
                {index > 0 ? <View style={styles.faqDivider} /> : null}
                <TouchableOpacity
                  style={styles.faqRow}
                  onPress={() => setOpenFaq(expanded ? null : id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  <View style={styles.faqIcon}>
                    <Icon size={ICON_SIZE.sm} color={colors.primaryGreen} />
                  </View>
                  <Text style={styles.faqQuestion}>{t(`faq.${id}.question`)}</Text>
                  {expanded ? (
                    <ChevronDown size={ICON_SIZE.sm} color={colors.textSecondary} />
                  ) : (
                    <ChevronRight size={ICON_SIZE.sm} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
                {expanded ? <Text style={styles.faqAnswer}>{t(`faq.${id}.answer`)}</Text> : null}
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionTitle}>{t('myTicketsTitle')}</Text>
      <View style={styles.filterRow}>
        {FILTERS.map((option) => {
          const active = filter === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {t(`filter.${option}`)} · {counts[option]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.skeletonStack}>
          <Skeleton width="100%" height={84} borderRadius={RADIUS.lg} />
          <Skeleton width="100%" height={84} borderRadius={RADIUS.lg} />
        </View>
      ) : null}
    </View>
  );

  // An empty list is never dressed up as something else — it says which of the
  // three reasons it is empty for, and only the genuinely-no-tickets case
  // invites an action.
  const listEmpty = isLoading ? null : search ? (
    <EmptyState
      icon={<Search size={ICON_SIZE.xl} color={colors.textSecondary} strokeWidth={1.5} />}
      title={t('emptySearchTitle', { query: query.trim() })}
      subtitle={t('emptySearchSubtitle')}
    />
  ) : filter !== 'all' ? (
    <EmptyState
      icon={<LifeBuoy size={ICON_SIZE.xl} color={colors.textSecondary} strokeWidth={1.5} />}
      title={t('emptyFilteredTitle')}
      subtitle={t('emptyFilteredSubtitle')}
    />
  ) : (
    <EmptyState
      icon={<LifeBuoy size={ICON_SIZE.xl} color={colors.textSecondary} strokeWidth={1.5} />}
      title={t('emptyTitle')}
      subtitle={t('emptySubtitle')}
    />
  );

  const renderTicket = ({ item }: { item: Ticket }) => {
    const updated = relativeTimeOrNull(item.updatedAt);
    // "2 messages · updated 5 mins ago" as one string, so an absent count or an
    // unparseable timestamp just drops out instead of leaving a stray separator.
    const trail = [
      item.messageCount > 0 ? t('messageCount', { count: item.messageCount }) : null,
      updated ? t('updatedAgo', { time: updated }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <TouchableOpacity
        style={styles.ticketRow}
        activeOpacity={0.8}
        onPress={() =>
          navigation.navigate('TicketDetail', {
            ticketId: item.id,
            ticketNumber: item.ticketNumber,
          })
        }
        accessibilityRole="button"
        accessibilityLabel={t('rowLabel', {
          number: item.ticketNumber,
          subject: item.subject,
          status: statusLabel(item.status, t),
        })}
      >
        <View style={styles.ticketTop}>
          <Text style={styles.ticketNumber}>{t('ticketRef', { number: item.ticketNumber })}</Text>
          <TicketStatusPill status={item.status} />
        </View>
        <Text style={styles.ticketSubject} numberOfLines={2}>
          {item.subject}
        </Text>
        <View style={styles.ticketMetaRow}>
          {item.category?.label ? (
            <Text style={styles.ticketMeta} numberOfLines={1}>
              {item.category.label}
            </Text>
          ) : null}
          {trail ? <Text style={styles.ticketMeta}>{trail}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  // A failed first load replaces the screen; a failed refresh of a list we
  // already have does not — the tickets on screen are still real.
  if (isError && tickets.length === 0 && !isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
        <BackHeader title={t('title')} />
        <ErrorState onRetry={refetch} retrying={isFetching} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      <BackHeader title={t('title')} />

      {/* The one scroll container on this screen — the FAQ, the CTA and the
          filters ride along as its header rather than in a second scroller. */}
      <FlatList
        data={visibleTickets}
        keyExtractor={(ticket) => ticket.id}
        renderItem={renderTicket}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + SPACING.xxxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={colors.primaryGreen}
          />
        }
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    listContent: { paddingHorizontal: SIZES.padding, gap: SPACING.xs },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      height: 44,
      paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    searchInput: { flex: 1, ...TYPE.subhead, color: colors.textPrimary },

    submitCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: colors.primaryGreen,
      borderRadius: RADIUS.xxl,
      padding: SPACING.sm,
      marginTop: SPACING.sm,
    },
    submitCtaIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    submitCtaBody: { flex: 1 },
    submitCtaTitle: { ...TYPE.title, color: colors.textOnTint },
    submitCtaSubtitle: { ...TYPE.caption, color: colors.textOnTint, opacity: 0.85, marginTop: 2 },

    sectionTitle: { ...TYPE.headlineStrong, color: colors.textPrimary, marginTop: SPACING.lg, marginBottom: SPACING.xs },

    faqCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    faqRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    faqIcon: {
      width: 28,
      height: 28,
      borderRadius: RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryGreenLight,
    },
    faqQuestion: { flex: 1, ...TYPE.body, fontWeight: '700', color: colors.textPrimary },
    faqAnswer: {
      ...TYPE.body,
      color: colors.textSecondary,
      lineHeight: 19,
      paddingHorizontal: SPACING.sm,
      paddingBottom: SPACING.sm,
      paddingLeft: SPACING.sm + 28 + SPACING.xs,
    },
    faqDivider: { height: 1, backgroundColor: colors.border, marginLeft: SPACING.sm },
    faqNoMatches: { ...TYPE.body, color: colors.textSecondary, lineHeight: 19 },

    filterRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.xs },
    filterChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xxs + 2,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    filterChipActive: { backgroundColor: colors.primaryGreenLight, borderColor: colors.primaryGreen },
    filterText: { ...TYPE.footnote, color: colors.textSecondary },
    filterTextActive: { color: colors.primaryGreen },

    skeletonStack: { gap: SPACING.xs },

    ticketRow: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.sm,
      minHeight: TOUCH_TARGET.min,
    },
    ticketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.xs },
    ticketNumber: { ...TYPE.microLabel, color: colors.textSecondary },
    ticketSubject: { ...TYPE.bodyStrong, color: colors.textPrimary, marginTop: SPACING.xxs, lineHeight: 18 },
    ticketMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.xs,
      marginTop: SPACING.xxs,
    },
    ticketMeta: { ...TYPE.caption, color: colors.textSecondary, flexShrink: 1 },
  });
