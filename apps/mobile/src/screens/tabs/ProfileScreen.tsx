import { useMemo, useState } from 'react';
import Constants from 'expo-constants';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Award,
  BookOpen,
  Bookmark,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  HeartHandshake,
  HelpCircle,
  LogOut,
  Pencil,
  Settings as SettingsIcon,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { useNavigation, CommonActions, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMe, getMyStats } from '@uthavu/libs-mobile/api/users';
import { Divider, ListRow, SectionHeading } from '@uthavu/libs-mobile/components';
import { listMyImpactStories } from '@uthavu/libs-mobile/api/impactStories';
import { logout as logoutApi } from '@uthavu/libs-mobile/api/auth';
import { clearToken } from '@uthavu/libs-mobile/lib/session';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

// The Profile menu's seven rows. `MENU_ICON_SIZE` is 18 — deliberately not
// ICON_SIZE.sm (16) or .md (20): 18 is what these rows have always rendered,
// and this table is the single place that value now lives.
const MENU_ICON_SIZE = 18;

const MENU_ITEMS: {
  route: 'MissionJournal' | 'MyImpactStories' | 'FlaggedComments' | 'SavedStories' | 'SupportHome' | 'InviteFriends' | 'Settings';
  labelKey: string;
  icon: typeof BookOpen;
}[] = [
  { route: 'MissionJournal', labelKey: 'profile.menuMissionJournal', icon: BookOpen },
  { route: 'MyImpactStories', labelKey: 'profile.menuMyImpactStories', icon: Sparkles },
  { route: 'FlaggedComments', labelKey: 'profile.menuFlaggedComments', icon: Flag },
  { route: 'SavedStories', labelKey: 'profile.menuSavedStories', icon: Bookmark },
  { route: 'SupportHome', labelKey: 'profile.menuHelpSupport', icon: HelpCircle },
  { route: 'InviteFriends', labelKey: 'profile.menuInviteFriends', icon: Users },
  { route: 'Settings', labelKey: 'profile.menuSettings', icon: SettingsIcon },
];

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
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['myStats'],
    queryFn: getMyStats,
  });
  // Same query key MyImpactStoriesScreen.tsx uses — the preview card and the
  // full list share one cache entry.
  const {
    data: impactStories,
    isLoading: impactStoriesLoading,
    refetch: refetchImpactStories,
  } = useQuery({ queryKey: ['myImpactStories'], queryFn: listMyImpactStories });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchStats(), refetchImpactStories()]);
    setRefreshing(false);
  };

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logoutApi().catch(() => {});
      await clearToken();
    },
    onSuccess: () => {
      queryClient.clear();
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' as never }] }));
    },
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton width={72} height={72} borderRadius={36} style={styles.avatar} />
        <Skeleton width={140} height={16} />
        <Skeleton width={110} height={13} style={styles.skeletonLine} />
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
      {/* Top Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <Avatar uri={me?.avatarUrl} label={me?.name || t('profile.defaultName')} size={38} style={styles.avatar} />
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{me?.name || t('profile.defaultName')}</Text>
            </View>
            <Text style={styles.location} numberOfLines={1}>
              {me?.city === me?.district || !me?.district ? me?.city ?? t('profile.locationNotSet') : `${me?.city}, ${me?.district}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editProfilePill}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.editProfileText}>{t('profile.editProfileButton')}</Text>
          </TouchableOpacity>
        </View>

        {/*
         * The only two trust signals this product can honestly show.
         *
         * GET /users/me/stats returns exactly `reportsCount` and
         * `missionsCount` — real totals, counted in Postgres. It deliberately
         * returns no reliability or success rate, because mission-completion
         * data can't support one yet (users.service.ts getStats says so in
         * full). This card used to render a hardcoded "96% Reliability" beside
         * a `?? 32` fallback that told a brand-new user they had 32 helps.
         *
         * Both were inventions, and the reliability figure was the same
         * fabricated trust score docs/PRODUCT-DECISIONS.md Decision 1 exists to
         * forbid — the prototype's "⭐ 4.9" in a different glyph. Do not
         * reintroduce either. If a number cannot be counted, it does not go on
         * this card; while it is loading it is a skeleton, never a guess.
         */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            {statsLoading ? (
              <Skeleton width={28} height={19} />
            ) : (
              <Text style={styles.statValue}>{stats?.missionsCount ?? 0}</Text>
            )}
            <Text style={styles.statLabel}>{t('profile.missionsJoinedLabel')}</Text>
          </View>
          <Divider orientation="vertical" length={22} />
          <View style={styles.statCell}>
            {statsLoading ? (
              <Skeleton width={28} height={19} />
            ) : (
              <Text style={styles.statValue}>{stats?.reportsCount ?? 0}</Text>
            )}
            <Text style={styles.statLabel}>{t('profile.reportsPostedLabel')}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.myReportsPill} onPress={() => navigation.navigate('MyReports')}>
          <FileText size={16} color={colors.primaryGreen} />
          <Text style={styles.myReportsPillText}>{t('profile.myReportsPill')}</Text>
          <ChevronRight size={14} color={colors.primaryGreen} />
        </TouchableOpacity>
      </View>

      {/* My Impact Stories Section */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{t('profile.impactStoriesHeading')}</Text>
        <TouchableOpacity style={styles.viewAllRow} onPress={() => navigation.navigate('MyImpactStories')}>
          <Text style={styles.viewAllText}>{t('profile.viewAll')}</Text>
          <ChevronRight size={14} color={colors.primaryGreen} />
        </TouchableOpacity>
      </View>

      {impactStoriesLoading ? (
        <View style={styles.impactCard}>
          <View style={styles.impactRow}>
            <Skeleton width={36} height={36} borderRadius={RADIUS.lg} />
            <View style={styles.impactBody}>
              <Skeleton width="70%" height={13} />
              <Skeleton width="40%" height={11} style={{ marginTop: 4 }} />
            </View>
          </View>
        </View>
      ) : impactStories && impactStories.length > 0 ? (
        <View style={styles.impactCard}>
          {impactStories.slice(0, 3).map((story, index, arr) => (
            <View key={story.reportId}>
              <TouchableOpacity
                style={styles.impactRow}
                onPress={() => navigation.navigate('RequestDetails', { reportId: story.reportId })}
                accessibilityRole="button"
                accessibilityLabel={story.title}
              >
                {story.photo ? (
                  <Image source={{ uri: story.photo }} style={styles.thumbnailBox} />
                ) : (
                  <View style={styles.thumbnailBox}>
                    <Text style={styles.thumbnailEmoji}>{story.category.emoji}</Text>
                  </View>
                )}
                <View style={styles.impactBody}>
                  <Text style={styles.impactTitle} numberOfLines={1}>
                    {story.title}
                  </Text>
                  <Text style={styles.impactSub}>{story.category.label}</Text>
                </View>
                <ChevronRight size={16} color={colors.textSecondary} />
              </TouchableOpacity>
              {index < arr.length - 1 && <Divider inset={SPACING.sm} />}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.impactCard}>
          <View style={styles.impactRow}>
            <Text style={styles.impactSub}>{t('profile.noImpactStories')}</Text>
          </View>
        </View>
      )}

      {/*
       * NO BADGES STRIP. A "Badges & Achievements" carousel used to sit here:
       * five hardcoded <View>s — First Helper, Animal Guardian, Community Hero,
       * Food Captain, Super Volunteer — with a literal "4 Unlocked" count. Four
       * rendered as earned for every user on first launch, including someone
       * who had never opened a mission.
       *
       * There is no achievements table, no endpoint, and no product decision
       * defining what any of those badges mean. Rebuilding the carousel means
       * designing the feature first; until then an empty space is honest and a
       * fake trophy is not. See docs/PRODUCT-DECISIONS.md Decision 1.
       */}

      {/* Menu List */}
      <SectionHeading title={t('profile.menuHeading')} />
      <View style={styles.menuCard}>
        {MENU_ITEMS.map((item, index) => {
          const Icon = item.icon;
          return (
            <View key={item.route}>
              <ListRow
                label={t(item.labelKey)}
                icon={<Icon size={MENU_ICON_SIZE} color={colors.textSecondary} />}
                density="comfortable"
                accessory="navigate"
                onPress={() => navigation.navigate(item.route)}
              />
              {index < MENU_ITEMS.length - 1 && <Divider inset={SPACING.sm} />}
            </View>
          );
        })}
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutPill}
        onPress={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        <LogOut size={18} color={colors.danger} />
        <Text style={styles.logoutText}>{logoutMutation.isPending ? t('profile.loggingOut') : t('profile.logOut')}</Text>
      </TouchableOpacity>

      {/* Version footer */}
      <Text style={styles.footerVersion}>
        {t('profile.versionLabel', { version: Constants.expoConfig?.version ?? '—' })}
      </Text>
      <Text style={styles.footerSub}>{t('profile.madeWithLove')}</Text>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number }) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    container: {
      flexGrow: 1,
      backgroundColor: colors.bg,
      padding: SPACING.lg,
      paddingTop: insets.top + SPACING.xs,
      paddingBottom: SPACING.xxxl,
    },
    skeletonLine: { marginTop: SPACING.xs },
    profileCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.sm,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    avatar: { width: 38, height: 38, borderRadius: 19 },
    profileInfo: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    name: { ...TYPE.subheadStrong, fontSize: 15, color: colors.textPrimary, flexShrink: 1, fontWeight: '700' },
    location: { ...TYPE.caption, fontSize: 11, color: colors.textSecondary, marginTop: 0 },
    editProfilePill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      marginLeft: 4,
    },
    editProfileText: {
      ...TYPE.footnote,
      fontSize: 11.5,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginTop: SPACING.xs,
      paddingTop: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    statCell: { alignItems: 'center' },
    statValue: { ...TYPE.title, fontSize: 17, color: colors.textPrimary, fontWeight: '800' },
    statLabel: { ...TYPE.caption, color: colors.textSecondary, marginTop: 1 },
    myReportsPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: SPACING.xs,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.primaryGreenLight,
      borderRadius: RADIUS.pill,
    },
    myReportsPillText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },

    sectionTitle: {
      ...TYPE.title,
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: '700',
      marginBottom: SPACING.xs,
      marginTop: SPACING.sm,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    viewAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    viewAllText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },

    impactCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.sm,
    },
    impactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs + 2,
      gap: SPACING.xs,
    },
    thumbnailBox: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.lg,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.primaryGreenLight,
    },
    thumbnailEmoji: { fontSize: 18 },
    impactBody: { flex: 1 },
    impactTitle: { ...TYPE.bodyStrong, fontSize: 13, color: colors.textPrimary },
    impactSub: { ...TYPE.caption, fontSize: 11, color: colors.textSecondary, marginTop: 1 },

    menuCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.lg,
    },

    logoutPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: '#FEE2E2',
      borderRadius: RADIUS.pill,
      paddingVertical: SPACING.sm + 2,
      marginBottom: SPACING.lg,
    },
    logoutText: { ...TYPE.subheadStrong, color: colors.danger, fontWeight: '700' },

    footerVersion: { textAlign: 'center', ...TYPE.caption, color: colors.textSecondary },
    footerSub: { textAlign: 'center', ...TYPE.caption, color: colors.textSecondary, marginTop: 2 },
  });

