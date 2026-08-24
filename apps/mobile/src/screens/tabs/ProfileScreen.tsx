import { useMemo, useState } from 'react';
import { Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  X,
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
import { listMyImpactStories } from '@uthavu/libs-mobile/api/impactStories';
import { logout as logoutApi } from '@uthavu/libs-mobile/api/auth';
import { clearToken } from '@uthavu/libs-mobile/lib/session';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type TicketCategory = 'Technical Problem' | 'Bug Report' | 'Account Problem' | 'Feature Request' | 'Complaint' | 'Other';

const TICKET_CATEGORIES: TicketCategory[] = [
  'Technical Problem',
  'Bug Report',
  'Account Problem',
  'Feature Request',
  'Complaint',
  'Other',
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

  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [ticketCategory, setTicketCategory] = useState<TicketCategory>('Technical Problem');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');

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
          <Avatar uri={me?.avatarUrl} label={me?.name || 'User'} size={38} style={styles.avatar} />
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{me?.name || 'User'}</Text>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
            <Text style={styles.location} numberOfLines={1}>
              {me?.city === me?.district || !me?.district ? me?.city ?? 'Location not set' : `${me?.city}, ${me?.district}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editProfilePill}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{stats?.missionsCount ?? 32}</Text>
            <Text style={styles.statLabel}>Total Helps</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>96%</Text>
            <Text style={styles.statLabel}>Reliability</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.myReportsPill} onPress={() => navigation.navigate('MyReports')}>
          <FileText size={16} color={colors.primaryGreen} />
          <Text style={styles.myReportsPillText}>My Reports</Text>
          <ChevronRight size={14} color={colors.primaryGreen} />
        </TouchableOpacity>
      </View>

      {/* My Impact Stories Section */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>My Impact Stories</Text>
        <TouchableOpacity style={styles.viewAllRow} onPress={() => navigation.navigate('MyImpactStories')}>
          <Text style={styles.viewAllText}>View All</Text>
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
              {index < arr.length - 1 && <View style={styles.cardDivider} />}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.impactCard}>
          <View style={styles.impactRow}>
            <Text style={styles.impactSub}>No impact stories yet — completed missions will show up here.</Text>
          </View>
        </View>
      )}

      {/* Badges Strip */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Badges & Achievements</Text>
        <Text style={styles.badgeCountText}>4 Unlocked</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesContainer}>
        <View style={styles.badgeItem}>
          <View style={[styles.badgeIconBox, { backgroundColor: '#FEF3C7' }]}>
            <Text style={styles.badgeEmoji}>🥇</Text>
          </View>
          <Text style={styles.badgeLabel}>First Helper</Text>
          <Text style={styles.badgeSub}>1st Mission Done</Text>
        </View>

        <View style={styles.badgeItem}>
          <View style={[styles.badgeIconBox, { backgroundColor: '#FFE4E6' }]}>
            <Text style={styles.badgeEmoji}>🐶</Text>
          </View>
          <Text style={styles.badgeLabel}>Animal Guardian</Text>
          <Text style={styles.badgeSub}>5 Rescues Completed</Text>
        </View>

        <View style={styles.badgeItem}>
          <View style={[styles.badgeIconBox, { backgroundColor: '#DCFCE7' }]}>
            <Text style={styles.badgeEmoji}>❤️</Text>
          </View>
          <Text style={styles.badgeLabel}>Community Hero</Text>
          <Text style={styles.badgeSub}>10+ Helps Completed</Text>
        </View>

        <View style={styles.badgeItem}>
          <View style={[styles.badgeIconBox, { backgroundColor: '#DBEAFE' }]}>
            <Text style={styles.badgeEmoji}>🍱</Text>
          </View>
          <Text style={styles.badgeLabel}>Food Captain</Text>
          <Text style={styles.badgeSub}>Food Drive Hero</Text>
        </View>

        <View style={[styles.badgeItem, styles.badgeLocked]}>
          <View style={[styles.badgeIconBox, { backgroundColor: colors.bgElevated }]}>
            <Text style={styles.badgeEmoji}>⭐</Text>
          </View>
          <Text style={styles.badgeLabel}>Super Volunteer</Text>
          <Text style={styles.badgeSub}>25 Missions Needed</Text>
        </View>
      </ScrollView>

      {/* Menu List */}
      <Text style={styles.sectionTitle}>Menu</Text>
      <View style={styles.menuCard}>
        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('MyReports')}>
          <FileText size={18} color={colors.primaryGreen} />
          <Text style={[styles.menuText, { color: colors.primaryGreen, fontWeight: '700' }]}>My Reports</Text>
          <ChevronRight size={16} color={colors.primaryGreen} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />
        <TouchableOpacity style={styles.menuRow}>
          <BookOpen size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>Mission Journal (My Activity)</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />

        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('MyImpactStories')}>
          <Sparkles size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>My Impact Stories</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />

        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('FlaggedComments')}>
          <Flag size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>Flagged Comments</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />

        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => navigation.dispatch(CommonActions.navigate({ name: 'MyHelpsTab' }))}
        >
          <Clock size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>My Active Helps</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />

        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('SavedStories')}>
          <Bookmark size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>Saved Stories</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />

        <TouchableOpacity style={styles.menuRow} onPress={() => setSupportModalOpen(true)}>
          <HelpCircle size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>Help & Support / Submit Ticket</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />

        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('InviteFriends')}>
          <Users size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>Invite Friends</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.cardDivider} />

        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Settings')}>
          <SettingsIcon size={18} color={colors.textSecondary} />
          <Text style={styles.menuText}>Settings</Text>
          <ChevronRight size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutPill}
        onPress={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        <LogOut size={18} color={colors.danger} />
        <Text style={styles.logoutText}>{logoutMutation.isPending ? t('profile.loggingOut') : 'Logout'}</Text>
      </TouchableOpacity>

      {/* Version footer */}
      <Text style={styles.footerVersion}>Version 1.0.4</Text>
      <Text style={styles.footerSub}>Made with ❤️ for the community.</Text>

      {/* Support Ticket Modal Sheet */}
      <Modal visible={supportModalOpen} transparent animationType="slide" onRequestClose={() => setSupportModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.ticketModalContainer}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleLeft}>
                <Text style={{ fontSize: 18 }}>💬</Text>
                <Text style={styles.modalTitle}>Submit Support Request</Text>
              </View>
              <TouchableOpacity onPress={() => setSupportModalOpen(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>What do you need help with?</Text>
            <View style={styles.categoriesWrap}>
              {TICKET_CATEGORIES.map((cat) => {
                const selected = ticketCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, selected && styles.categoryChipActive]}
                    onPress={() => setTicketCategory(cat)}
                  >
                    <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldTitle}>Subject</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Image upload failed on slow 3G"
              placeholderTextColor={colors.textSecondary}
              value={ticketSubject}
              onChangeText={setTicketSubject}
            />

            <Text style={styles.fieldTitle}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Tell us what happened..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              value={ticketDescription}
              onChangeText={setTicketDescription}
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSupportModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={() => setSupportModalOpen(false)}>
                <Text style={styles.submitBtnText}>Submit Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    verifiedBadge: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: '#BBF7D0',
    },
    verifiedText: {
      ...TYPE.captionStrong,
      fontSize: 9.5,
      color: '#15803D',
    },
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
    statsDivider: { width: 1, height: 22, backgroundColor: colors.border },
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
    cardDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: SPACING.sm },

    badgeCountText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },
    badgesContainer: {
      gap: SPACING.xs,
      marginBottom: SPACING.lg,
    },
    badgeItem: {
      alignItems: 'center',
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      minWidth: 116,
    },
    badgeLocked: {
      opacity: 0.55,
      borderStyle: 'dashed',
    },
    badgeIconBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.xs - 2,
    },
    badgeEmoji: { fontSize: 22 },
    badgeLabel: { ...TYPE.footnote, color: colors.textPrimary, fontWeight: '800', textAlign: 'center' },
    badgeSub: { ...TYPE.caption, fontSize: 10, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },

    menuCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: SPACING.lg,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    menuText: { flex: 1, ...TYPE.subheadStrong, fontSize: 14, color: colors.textPrimary },

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

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.65)',
      justifyContent: 'center',
      padding: SPACING.lg,
    },
    ticketModalContainer: {
      backgroundColor: colors.bg,
      borderRadius: RADIUS.xxl,
      padding: SPACING.lg,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    modalTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    modalTitle: { ...TYPE.title, color: colors.textPrimary, fontWeight: '800' },
    fieldLabel: { ...TYPE.footnoteRegular, color: colors.textSecondary, marginBottom: SPACING.xs },
    categoriesWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
      marginBottom: SPACING.md,
    },
    categoryChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs - 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipActive: {
      backgroundColor: colors.primaryGreen,
      borderColor: colors.primaryGreen,
    },
    categoryChipText: { ...TYPE.footnote, color: colors.textSecondary, fontWeight: '600' },
    categoryChipTextActive: { color: '#FFFFFF', fontWeight: '700' },
    fieldTitle: { ...TYPE.footnote, color: colors.textPrimary, fontWeight: '700', marginBottom: SPACING.xxs },
    textInput: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      ...TYPE.subhead,
      color: colors.textPrimary,
      marginBottom: SPACING.md,
    },
    textArea: {
      height: 90,
      textAlignVertical: 'top',
    },
    modalButtonRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
    },
    cancelBtnText: { ...TYPE.subheadStrong, color: colors.textSecondary },
    submitBtn: {
      flex: 1.5,
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.primaryGreen,
    },
    submitBtnText: { ...TYPE.subheadStrong, color: '#FFFFFF', fontWeight: '700' },
  });

