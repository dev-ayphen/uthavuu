import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellOff, CheckCheck } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getAlerts, markAllAlertsRead, type Alert } from '@uthavu/libs-mobile/api/alerts';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

// Only the alert types that actually exist (AlertsService only ever emits
// volunteer_accepted/volunteer_released/mission_completed — see
// alert-templates.ts). No "Nearby"/"System" tab: this app has no
// location-broadcast or system-notification alert type, so a tab for either
// would always be empty — decorative, not a real filter.
type FilterTab = 'All' | 'Requests' | 'Updates';

const FILTER_TABS: FilterTab[] = ['All', 'Requests', 'Updates'];

// Module-level array can't call useTranslation() — store the i18n key per
// tab, resolve with t() at render time (same pattern used elsewhere in this
// app for module-level option lists, e.g. SettingsScreen's THEME_OPTIONS).
const FILTER_TAB_LABEL_KEYS: Record<FilterTab, string> = {
  All: 'alerts.tabAll',
  Requests: 'alerts.tabRequests',
  Updates: 'alerts.tabUpdates',
};

function renderAlertContent(
  t: (key: string, options?: Record<string, unknown>) => string,
  exists: (key: string, options?: Record<string, unknown>) => boolean,
  alert: Alert
): { title: string; body: string } {
  const titleKey = `alerts.content.${alert.type}.title`;
  const bodyKey = `alerts.content.${alert.type}.body`;
  if (!exists(titleKey, { ns: 'tabs' }) || !exists(bodyKey, { ns: 'tabs' })) {
    return { title: alert.title, body: alert.body };
  }

  const volunteerName = alert.params.volunteerName ?? t('alerts.content.aVolunteer');
  return {
    title: t(titleKey),
    body: t(bodyKey, { volunteerName, reportTitle: alert.params.reportTitle }),
  };
}

export default function AlertsScreen() {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation(['tabs', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<FilterTab>('All');

  const { data: alerts, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['alerts'],
    queryFn: getAlerts,
  });

  const markReadMutation = useMutation({
    mutationFn: markAllAlertsRead,
    onSuccess: (updated) => queryClient.setQueryData(['alerts'], updated),
  });

  const unreadCount = (alerts ?? []).filter((a) => !a.read).length;

  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    if (selectedTab === 'All') return alerts;
    if (selectedTab === 'Requests') {
      return alerts.filter((a) => a.type === 'volunteer_released' || a.type === 'volunteer_accepted');
    }
    return alerts.filter((a) => a.type === 'mission_completed');
  }, [alerts, selectedTab]);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{t('alerts.title')}</Text>
          </View>
        </View>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <AlertRowSkeleton key={i} styles={styles} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && !alerts) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('alerts.title')}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{t('alerts.unreadCountBadge', { count: unreadCount })}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.markReadButton}
          onPress={() => markReadMutation.mutate()}
          disabled={markReadMutation.isPending || unreadCount === 0}
          accessibilityRole="button"
          accessibilityLabel={t('alerts.markAllReadLabel')}
        >
          <CheckCheck size={ICON_SIZE.sm} color={colors.primaryGreen} />
          <Text style={styles.markReadText}>{t('alerts.markAllRead')}</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Tabs Scroll */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {FILTER_TABS.map((tab) => {
            const isSelected = selectedTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabPill, isSelected && styles.tabPillActive]}
                onPress={() => setSelectedTab(tab)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                  {t(FILTER_TAB_LABEL_KEYS[tab])}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main List */}
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isFetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.empty}>
            <BellOff size={40} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>{t('alerts.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('alerts.emptySubtitle')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AlertRow
            alert={item}
            content={renderAlertContent(t, i18n.exists.bind(i18n), item)}
            styles={styles}
            viewDetailsHint={t('common:viewDetailsHint')}
            onPress={
              item.reportId
                ? () => navigation.navigate('RequestDetails', { reportId: item.reportId! })
                : undefined
            }
          />
        )}
      />
    </View>
  );
}

function AlertRow({
  alert,
  content: { title, body },
  styles,
  viewDetailsHint,
  onPress,
}: {
  alert: Alert;
  content: { title: string; body: string };
  styles: ReturnType<typeof createStyles>;
  viewDetailsHint: string;
  onPress?: () => void;
}) {
  const rowContent = (
    <View style={styles.cardInner}>
      <View style={styles.cardHeader}>
        <View style={[styles.unreadDot, alert.read && styles.unreadDotHidden]} />
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(alert.createdAt)}</Text>
      </View>
      <Text style={styles.rowMessage}>{body}</Text>
    </View>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, !alert.read && styles.cardUnread]} accessibilityLabel={`${title}. ${body}`}>
        {rowContent}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, !alert.read && styles.cardUnread]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityHint={viewDetailsHint}
    >
      {rowContent}
    </TouchableOpacity>
  );
}

function AlertRowSkeleton({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <Skeleton width={100} height={14} />
          <Skeleton width={60} height={12} />
        </View>
        <Skeleton width="65%" height={16} style={{ marginTop: SPACING.xs }} />
        <Skeleton width="90%" height={14} style={{ marginTop: SPACING.xxs }} />
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SIZES.padding,
      marginBottom: SPACING.xs,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    title: {
      ...TYPE.pageTitle,
      color: colors.textPrimary,
    },
    unreadBadge: {
      backgroundColor: TONES.critical.fill,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs / 2,
      borderRadius: RADIUS.pill,
    },
    unreadBadgeText: {
      ...TYPE.microLabel,
      color: colors.danger,
    },
    markReadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      backgroundColor: colors.primaryGreenLight,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xxs,
      borderRadius: RADIUS.pill,
    },
    markReadText: {
      ...TYPE.footnote,
      color: colors.primaryGreen,
      fontWeight: '700',
    },
    tabsWrapper: {
      marginBottom: SPACING.sm,
    },
    tabsContainer: {
      paddingHorizontal: SIZES.padding,
      gap: SPACING.xs,
    },
    tabPill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    // Mirrors MyHelpsScreen's tabPillActive treatment — same segmented-tab
    // pattern, kept visually consistent across the two screens that use it.
    tabPillActive: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
    },
    tabText: {
      ...TYPE.footnote,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    list: {
      paddingHorizontal: SIZES.padding,
      paddingBottom: SPACING.xxxl,
      gap: SPACING.md,
    },
    card: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
    },
    cardUnread: {
      borderLeftWidth: 3.5,
      borderLeftColor: colors.primaryGreen,
    },
    cardInner: {
      flexDirection: 'column',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      marginBottom: SPACING.xxs,
    },
    // No dot-size token this small exists — derived from SPACING.xxs rather
    // than a bare literal so it still traces to the spacing scale.
    unreadDot: {
      width: SPACING.xxs * 2,
      height: SPACING.xxs * 2,
      borderRadius: SPACING.xxs,
      backgroundColor: colors.primaryGreen,
    },
    unreadDotHidden: {
      backgroundColor: 'transparent',
    },
    rowTitle: {
      ...TYPE.headlineStrong,
      color: colors.textPrimary,
      flex: 1,
    },
    rowTime: {
      ...TYPE.caption,
      color: colors.textSecondary,
    },
    rowMessage: {
      ...TYPE.body,
      color: colors.textSecondary,
      marginTop: SPACING.xxs,
      lineHeight: 18,
    },
    empty: {
      alignItems: 'center',
      paddingTop: SPACING.xxxl,
      gap: SPACING.xs,
      paddingHorizontal: SPACING.xl,
    },
    emptyTitle: {
      ...TYPE.title,
      color: colors.textPrimary,
      marginTop: SPACING.xs,
    },
    emptySubtitle: {
      ...TYPE.subhead,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });

