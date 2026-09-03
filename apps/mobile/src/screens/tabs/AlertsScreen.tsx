import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { Dot, ErrorState, ScreenHeader, Skeleton, TabBar } from '@uthavu/libs-mobile/components';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

// Every tab here maps to alert types the server actually emits — the closed
// union in alert-templates.ts plus BROADCAST_ALERT_TYPE:
//
//   Requests -> volunteer_accepted | volunteer_released | report_cancelled
//   Updates  -> mission_completed
//   System   -> broadcast
//
// There is no "Nearby" tab. It used to sit here alongside "System", and both
// fell through to `return alerts` — so three of the five tabs rendered an
// identical list and the two named ones were pure decoration. A tab is a
// promise that the list narrows; one that cannot narrow is a lie about the
// data. Nearby is gone rather than emptied because no nearby-request alert
// type exists at all: nothing is fanned out to nearby users when a report is
// created, so the tab could only ever have been empty. Add it back in the same
// commit that adds the alert type, never before.
type FilterTab = 'All' | 'Requests' | 'Updates' | 'System';

const FILTER_TABS: FilterTab[] = ['All', 'Requests', 'Updates', 'System'];

// Module-level array can't call useTranslation() — store the i18n key per
// tab, resolve with t() at render time (same pattern used elsewhere in this
// app for module-level option lists, e.g. SettingsScreen's THEME_OPTIONS).
const FILTER_TAB_LABEL_KEYS: Record<FilterTab, string> = {
  All: 'alerts.tabAll',
  Requests: 'alerts.tabRequests',
  Updates: 'alerts.tabUpdates',
  System: 'alerts.tabSystem',
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
      // `report_cancelled` belongs here: it is about a request the user joined.
      // Without it the alert appeared under All and nowhere else.
      return alerts.filter(
        (a) =>
          a.type === 'volunteer_released' ||
          a.type === 'volunteer_accepted' ||
          a.type === 'report_cancelled'
      );
    }
    if (selectedTab === 'Updates') {
      return alerts.filter((a) => a.type === 'mission_completed');
    }
    // System — platform announcements sent from the admin console. This is the
    // only tab `broadcast` appears under, and before it existed the type showed
    // up under All and nowhere else, which is what the two decorative tabs were
    // hiding.
    return alerts.filter((a) => a.type === 'broadcast');
  }, [alerts, selectedTab]);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <ScreenHeader title={t('alerts.title')} />
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
      <ScreenHeader
        title={t('alerts.title')}
        badge={unreadCount > 0 ? t('alerts.unreadCountBadge', { count: unreadCount }) : undefined}
        actionLabel={t('alerts.markAllRead')}
        actionIcon={<CheckCheck size={ICON_SIZE.sm} color={colors.primaryGreen} />}
        onAction={() => markReadMutation.mutate()}
        actionDisabled={markReadMutation.isPending || unreadCount === 0}
      />

      {/* Horizontal Tabs Scroll */}
      <TabBar
        scrollable
        items={FILTER_TABS.map((tab) => ({ key: tab, label: t(FILTER_TAB_LABEL_KEYS[tab]) }))}
        selected={selectedTab}
        onSelect={setSelectedTab}
      />

      {/* Main List */}
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primaryGreen} />
        }
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
        <Dot visible={!alert.read} />
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

