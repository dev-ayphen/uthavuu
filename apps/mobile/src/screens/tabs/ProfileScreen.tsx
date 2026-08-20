import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMe } from '@uthavu/libs-mobile/api/users';
import { logout as logoutApi } from '@uthavu/libs-mobile/api/auth';
import { clearToken } from '@uthavu/libs-mobile/lib/session';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import Button from '@uthavu/libs-mobile/components/Button';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data: me, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
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
      <Avatar uri={me?.avatarUrl} label={me?.name || 'Uthavu user'} size={72} style={styles.avatar} />
      <Text style={styles.name}>{me?.name || 'Uthavu user'}</Text>
      <Text style={styles.phone}>{me?.phoneNumber}</Text>
      {me?.city ? <Text style={styles.location}>{me.city}, {me.district}</Text> : null}

      <Button
        label={logoutMutation.isPending ? 'Logging out…' : 'Log out'}
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
    logoutButton: { marginTop: SPACING.xxl, paddingHorizontal: SPACING.xl },
  });
