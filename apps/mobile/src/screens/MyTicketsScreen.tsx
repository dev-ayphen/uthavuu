import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HelpCircle } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { listMyTickets, type Ticket } from '@uthavu/libs-mobile/api/tickets';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import BackHeader from '@uthavu/libs-mobile/components/BackHeader';
import EmptyState from '@uthavu/libs-mobile/components/EmptyState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

// Profile → Help & Support → My Tickets. Reads what the (not-yet-wired,
// see ProfileScreen.tsx's supportModalOpen) Submit Ticket modal creates via
// POST /support/tickets — same real backend, no fabricated ticket data.
export default function MyTicketsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation(['tickets', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: tickets, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['myTickets'],
    queryFn: listMyTickets,
  });

  const statusLabel = (status: Ticket['status']) => t(`status.${status.key}`, { defaultValue: status.label });
  // 'resolved' uses the app's real success color (primaryGreen), not a TONES
  // entry — TONES has no green/success tone, only neutral/warning/critical.
  const statusTone = (key: string) =>
    key === 'in_review' ? TONES.soon : key === 'resolved' ? null : TONES.adminManaged;

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <BackHeader title={t('title')} />
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={78} borderRadius={RADIUS.lg} style={styles.skeletonRow} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && !tickets) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <BackHeader title={t('title')} />

      <FlatList
        data={tickets ?? []}
        keyExtractor={(ticket) => ticket.id}
        contentContainerStyle={styles.list}
        refreshing={isFetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <EmptyState
            icon={<HelpCircle size={40} color={colors.textSecondary} strokeWidth={1.5} />}
            title={t('emptyTitle')}
            subtitle={t('emptySubtitle')}
          />
        }
        renderItem={({ item }) => {
          const tone = statusTone(item.status.key);
          return (
            <View
              style={styles.card}
              accessibilityLabel={t('rowLabel', {
                subject: item.subject,
                category: item.category.label,
                status: statusLabel(item.status),
              })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.category}>{item.category.label}</Text>
                <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.subject} numberOfLines={1}>
                {item.subject}
              </Text>
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  tone
                    ? { backgroundColor: tone.fill, borderColor: tone.border }
                    : { backgroundColor: colors.primaryGreenLight, borderColor: colors.primaryGreen },
                ]}
              >
                <Text style={[styles.statusText, { color: tone ? tone.fg : colors.primaryGreen }]}>
                  {statusLabel(item.status)}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    skeletonRow: { marginBottom: SPACING.sm },
    card: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    category: { ...TYPE.captionStrong, color: colors.textSecondary },
    time: { ...TYPE.caption, color: colors.textSecondary },
    subject: { ...TYPE.bodyStrong, color: colors.textPrimary, marginTop: SPACING.xxs },
    description: { ...TYPE.body, color: colors.textSecondary, marginTop: SPACING.xxs / 2 },
    statusPill: {
      alignSelf: 'flex-start',
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs / 2,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
    },
    statusText: { ...TYPE.footnoteRegular, fontWeight: '700' },
  });
