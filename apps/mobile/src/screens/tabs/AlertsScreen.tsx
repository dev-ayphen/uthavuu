import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getAlerts, markAllAlertsRead, type Alert } from '@uthavu/libs-mobile/api/alerts';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

// Renders from `type` + `params` against this build's own catalog
// (tabs.alerts.content.*) rather than the server's stored title/body, so an
// alert re-renders instantly in the user's current language even for one
// written before they switched — see alert-templates.ts on the API side,
// which this mirrors key-for-key. Falls back to the server's own English
// rendering for a `type` this build doesn't recognise (an older client
// after the server adds a new type), rather than a missing-key string.
function renderAlertContent(
  t: (key: string, options?: Record<string, unknown>) => string,
  exists: (key: string, options?: Record<string, unknown>) => boolean,
  alert: Alert
): { title: string; body: string } {
  // i18n.exists() does NOT share useTranslation()'s bound namespace-list
  // resolution the way its t() does — it falls back to the global
  // defaultNS ('common') unless told otherwise, so these keys (which live
  // in 'tabs') need an explicit ns here even though the sibling t() calls
  // below don't. Confirmed live: without this, exists() always returned
  // false and every alert silently fell back to the English server
  // rendering, in every locale, page chrome around it localizing fine.
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

  const { data: alerts, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['alerts'],
    queryFn: getAlerts,
  });

  const markReadMutation = useMutation({
    mutationFn: markAllAlertsRead,
    onSuccess: (updated) => queryClient.setQueryData(['alerts'], updated),
  });

  const unreadCount = (alerts ?? []).filter((a) => !a.read).length;

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('alerts.title')}</Text>
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
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('alerts.title')}</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markReadButton}
            onPress={() => markReadMutation.mutate()}
            disabled={markReadMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('alerts.markAllReadLabel')}
          >
            <CheckCheck size={ICON_SIZE.xs} color={colors.primaryGreen} />
            <Text style={styles.markReadText}>{t('alerts.markAllRead')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={alerts ?? []}
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
            colors={colors}
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
  colors,
  styles,
  viewDetailsHint,
  onPress,
}: {
  alert: Alert;
  content: { title: string; body: string };
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  viewDetailsHint: string;
  onPress?: () => void;
}) {
  const rowContent = (
    <>
      <View style={[styles.unreadDot, alert.read && styles.unreadDotHidden]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMessage}>{body}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(alert.createdAt)}</Text>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, !alert.read && styles.rowUnread]} accessibilityLabel={`${title}. ${body}`}>
        {rowContent}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.row, !alert.read && styles.rowUnread]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityHint={viewDetailsHint}
    >
      {rowContent}
    </TouchableOpacity>
  );
}

// Mirrors AlertRow's real layout (dot + two text lines + timestamp) so the
// initial load doesn't jump when real content replaces it.
function AlertRowSkeleton({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.row}>
      <Skeleton width={8} height={8} borderRadius={4} />
      <View style={styles.rowBody}>
        <Skeleton width="50%" height={13} />
        <Skeleton width="85%" height={12} style={styles.skeletonLine} />
        <Skeleton width={70} height={11} style={styles.skeletonMetaLine} />
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
      marginBottom: SPACING.sm,
    },
    title: { ...TYPE.pageTitle, color: colors.textPrimary },
    markReadButton: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs },
    markReadText: { ...TYPE.footnote, color: colors.primaryGreen },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    skeletonLine: { marginTop: SPACING.xxs },
    skeletonMetaLine: { marginTop: SPACING.xs },
    row: {
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: SPACING.sm,
      alignItems: 'flex-start',
    },
    rowUnread: { borderColor: colors.primaryGreen },
    // No icon/dot-size token this small exists — derived from SPACING.xxs
    // rather than a bare literal so it still traces to the spacing scale.
    unreadDot: {
      width: SPACING.xxs * 2,
      height: SPACING.xxs * 2,
      borderRadius: SPACING.xxs,
      backgroundColor: colors.primaryGreen,
      marginTop: SPACING.xxs,
    },
    unreadDotHidden: { backgroundColor: 'transparent' },
    rowBody: { flex: 1 },
    rowTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    rowMessage: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
    rowTime: { ...TYPE.caption, color: colors.textSecondary, marginTop: SPACING.xs },
    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs, paddingHorizontal: SPACING.xl },
    emptyTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
