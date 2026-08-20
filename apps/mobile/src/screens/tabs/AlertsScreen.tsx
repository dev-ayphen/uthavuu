import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellOff, CheckCheck } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// Only two alert types exist today — a reporter is notified when a
// volunteer accepts their report, and when a volunteer voluntarily leaves
// (see MissionsService.accept()/leave()). Rendered generically by
// title/body rather than switching on `type`, so a future third type needs
// no change here.
export default function AlertsScreen() {
  const { colors } = useTheme();
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
          <Text style={styles.title}>Alerts</Text>
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
        <Text style={styles.title}>Alerts</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markReadButton}
            onPress={() => markReadMutation.mutate()}
            disabled={markReadMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Mark all alerts as read"
          >
            <CheckCheck size={ICON_SIZE.xs} color={colors.primaryGreen} />
            <Text style={styles.markReadText}>Mark all read</Text>
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
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptySubtitle}>
              You'll see updates here when a volunteer responds to your reports.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <AlertRow
            alert={item}
            colors={colors}
            styles={styles}
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
  colors,
  styles,
  onPress,
}: {
  alert: Alert;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.unreadDot, alert.read && styles.unreadDotHidden]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{alert.title}</Text>
        <Text style={styles.rowMessage}>{alert.body}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(alert.createdAt)}</Text>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, !alert.read && styles.rowUnread]} accessibilityLabel={`${alert.title}. ${alert.body}`}>
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.row, !alert.read && styles.rowUnread]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${alert.title}. ${alert.body}`}
      accessibilityHint="View request details"
    >
      {content}
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
