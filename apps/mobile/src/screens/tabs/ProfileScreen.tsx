import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { ICON_SIZE, SPACING, TYPE } from '../../theme/tokens';
import { getMe } from '../../api/users';
import { logout as logoutApi } from '../../api/auth';
import { clearToken } from '../../lib/session';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import Skeleton from '../../components/Skeleton';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: getMe });

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

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', padding: SPACING.xl, paddingTop: 64 },
    avatar: { marginBottom: SPACING.md },
    name: { ...TYPE.display, color: colors.textPrimary },
    phone: { ...TYPE.subhead, color: colors.textSecondary, marginTop: SPACING.xxs },
    location: { ...TYPE.body, color: colors.textSecondary, marginTop: 2 },
    skeletonLine: { marginTop: SPACING.xs },
    logoutButton: { marginTop: SPACING.xxl, paddingHorizontal: SPACING.xl },
  });
