import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, Pencil, Settings as SettingsIcon } from 'lucide-react-native';
import { useNavigation, CommonActions, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMe, getMyStats } from '@uthavu/libs-mobile/api/users';
import { logout as logoutApi } from '@uthavu/libs-mobile/api/auth';
import { clearToken } from '@uthavu/libs-mobile/lib/session';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation('tabs');
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const navigation = useNavigation<
    CompositeNavigationProp<
      BottomTabNavigationProp<MainTabParamList>,
      NativeStackNavigationProp<RootStackParamList>
    >
  >();
  const queryClient = useQueryClient();

  const { data: me, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: ['me'], queryFn: getMe });
  // Non-fatal secondary query, same treatment as DashboardScreen's `summary`:
  // `me` is what this screen can't render without; a failed stats fetch just
  // means the stats row doesn't show, not a full-screen error.
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['myStats'],
    queryFn: getMyStats,
  });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchStats()]);
    setRefreshing(false);
  };

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logoutApi().catch(() => {
        // Session may already be invalid server-side — clearing the local
        // token still gets the user out of the app either way.
      });
      await clearToken();
    },
    onSuccess: () => {
      queryClient.clear();
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: 'Login' as never }] })
      );
    },
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={72} height={72} borderRadius={36} style={styles.avatar} />
        <Skeleton width={140} height={16} />
        <Skeleton width={110} height={13} style={styles.skeletonLine} />
        <Skeleton width={90} height={13} style={styles.skeletonLine} />
      </View>
    );
  }

  if (isError && !me) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGreen} />
      }
    >
      <Avatar uri={me?.avatarUrl} label={me?.name || t('profile.defaultName')} size={72} style={styles.avatar} />
      <Text style={styles.name}>{me?.name || t('profile.defaultName')}</Text>
      <Text style={styles.phone}>{me?.phoneNumber}</Text>
      {me?.city ? <Text style={styles.location}>{me.city}, {me.district}</Text> : null}

      {statsLoading ? (
        <View style={styles.statsRow}>
          <Skeleton width={70} height={36} />
          <View style={styles.statsDivider} />
          <Skeleton width={70} height={36} />
        </View>
      ) : stats ? (
        <View
          style={styles.statsRow}
          accessible
          accessibilityLabel={`${t('profile.reportsPostedCount', { count: stats.reportsCount })}, ${t('profile.missionsJoinedCount', { count: stats.missionsCount })}`}
        >
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.reportsCount}</Text>
            <Text style={styles.statLabel}>{t('profile.reportsPostedLabel')}</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats.missionsCount}</Text>
            <Text style={styles.statLabel}>{t('profile.missionsJoinedLabel')}</Text>
          </View>
        </View>
      ) : null}

      <Button
        label={t('profile.editProfileButton')}
        variant="secondary"
        icon={<Pencil size={ICON_SIZE.sm} color={colors.textPrimary} />}
        onPress={() => navigation.navigate('EditProfile')}
        style={styles.editButton}
      />

      <Button
        label={t('profile.settingsButton')}
        variant="secondary"
        icon={<SettingsIcon size={ICON_SIZE.sm} color={colors.textPrimary} />}
        onPress={() => navigation.navigate('Settings')}
        style={styles.editButton}
      />

      <Button
        label={logoutMutation.isPending ? t('profile.loggingOut') : t('profile.logOut')}
        variant="dangerOutline"
        icon={<LogOut size={ICON_SIZE.sm} color={colors.danger} />}
        onPress={() => logoutMutation.mutate()}
        loading={logoutMutation.isPending}
        style={styles.logoutButton}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    container: {
      flexGrow: 1,
      backgroundColor: colors.bg,
      alignItems: 'center',
      padding: SPACING.xl,
      paddingTop: insets.top + SPACING.xxl,
    },
    avatar: { marginBottom: SPACING.md },
    name: { ...TYPE.display, color: colors.textPrimary },
    phone: { ...TYPE.subhead, color: colors.textSecondary, marginTop: SPACING.xxs },
    location: { ...TYPE.body, color: colors.textSecondary, marginTop: 2 },
    skeletonLine: { marginTop: SPACING.xs },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACING.lg,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xl,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      gap: SPACING.xl,
    },
    statCell: { alignItems: 'center', minWidth: 90 },
    statValue: { ...TYPE.title, color: colors.textPrimary },
    statLabel: { ...TYPE.caption, color: colors.textSecondary, marginTop: SPACING.xxs },
    statsDivider: { width: 1, height: 32, backgroundColor: colors.border },
    editButton: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
    logoutButton: { marginTop: SPACING.md, paddingHorizontal: SPACING.xl },
  });
