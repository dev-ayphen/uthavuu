import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, FileText, MapPin, Users } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMyReports, type Report } from '@uthavu/libs-mobile/api/reports';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

type TabType = 'active' | 'completed' | 'cancelled' | 'expired';

export default function MyReportsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const [activeTab, setActiveTab] = useState<TabType>('active');

  const { data: reports, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['myReports'],
    queryFn: getMyReports,
  });

  const filteredReports = useMemo(() => {
    if (!reports) return [];
    switch (activeTab) {
      case 'active':
        return reports.filter((r) => r.status === 'open');
      case 'completed':
        return reports.filter((r) => r.status === 'completed');
      case 'cancelled':
        return reports.filter((r) => r.status === 'closed');
      case 'expired':
        return reports.filter((r) => r.status === 'expired');
      default:
        return reports;
    }
  }, [reports, activeTab]);

  const counts = useMemo(() => {
    if (!reports) return { active: 0, completed: 0, cancelled: 0, expired: 0 };
    return {
      active: reports.filter((r) => r.status === 'open').length,
      completed: reports.filter((r) => r.status === 'completed').length,
      cancelled: reports.filter((r) => r.status === 'closed').length,
      expired: reports.filter((r) => r.status === 'expired').length,
    };
  }, [reports]);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
        <View style={styles.headerRow}>
          <BackButton />
          <Text style={styles.headerTitle}>My Reports</Text>
        </View>
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.cardSkeleton}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (isError && !reports) {
    return <ErrorState onRetry={refetch} retrying={isFetching} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      {/* Top Navigation */}
      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>My Reports</Text>
        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeText}>{reports?.length ?? 0}</Text>
        </View>
      </View>

      {/* Horizontally scrollable pill tabs — prevents text wrapping */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {(['active', 'completed', 'cancelled', 'expired'] as TabType[]).map((tab) => {
            const isSelected = activeTab === tab;
            const label = tab.charAt(0).toUpperCase() + tab.slice(1);
            const count = counts[tab];
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabPill, isSelected && styles.tabPillActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                  {label}
                </Text>
                <View style={[styles.countBadge, isSelected && styles.countBadgeActive]}>
                  <Text style={[styles.countText, isSelected && styles.countTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Reports List */}
      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primaryGreen} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <FileText size={40} color={colors.textSecondary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No {activeTab} reports</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'active'
                ? "You haven't posted any active help requests."
                : `No ${activeTab} reports found in your history.`}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ReportItemCard
            report={item}
            colors={colors}
            styles={styles}
            onView={() => navigation.navigate('RequestDetails', { reportId: item.id })}
          />
        )}
      />
    </View>
  );
}

function ReportItemCard({
  report,
  colors,
  styles,
  onView,
}: {
  report: Report;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  onView: () => void;
}) {
  const statusBadge = useMemo(() => {
    switch (report.status) {
      case 'completed':
        return { label: 'Completed', tone: { fg: '#15803D', fill: '#DCFCE7', border: '#BBF7D0' } };
      case 'closed':
        return { label: 'Cancelled', tone: { fg: '#64748B', fill: '#F1F5F9', border: '#E2E8F0' } };
      case 'expired':
        return { label: 'Expired', tone: { fg: '#64748B', fill: '#F1F5F9', border: '#E2E8F0' } };
      default:
        return report.assignedVolunteersCount && report.assignedVolunteersCount > 0
          ? { label: 'Active Mission', tone: TONES.soon }
          : { label: 'Status: Open', tone: { fg: COLORS.infoStrong, fill: COLORS.infoBg, border: COLORS.infoBorder } };
    }
  }, [report.status, report.assignedVolunteersCount]);

  const joinedCount = report.assignedVolunteersCount ?? 0;
  const neededCount = report.neededVolunteers ?? 1;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: statusBadge.tone.fill, borderColor: statusBadge.tone.border }]}>
          <Text style={[styles.badgeText, { color: statusBadge.tone.fg }]}>{statusBadge.label}</Text>
        </View>
        <Text style={styles.categoryLabel}>
          {report.category.emoji} {report.category.label}
        </Text>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {report.title}
      </Text>

      <View style={styles.metaRow}>
        <Users size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>
          {joinedCount} / {neededCount} volunteers joined
        </Text>
        {report.landmark && (
          <>
            <Text style={styles.dot}>·</Text>
            <MapPin size={14} color={colors.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {report.landmark}
            </Text>
          </>
        )}
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardFooter}>
        <Text style={styles.expiryText}>
          {report.status === 'open' ? 'Active' : report.status}
        </Text>
        <TouchableOpacity style={styles.viewBtn} onPress={onView}>
          <Text style={styles.viewBtnText}>View</Text>
          <ArrowRight size={13} color={colors.primaryGreen} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SIZES.padding,
      gap: 8,
      marginBottom: SPACING.xs,
    },
    headerTitle: { ...TYPE.title, fontSize: 18, color: colors.textPrimary, fontWeight: '800' },
    totalBadge: {
      backgroundColor: colors.primaryGreenLight,
      borderWidth: 1,
      borderColor: colors.primaryGreen,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    totalBadgeText: { ...TYPE.microLabel, fontSize: 12, color: colors.primaryGreen, fontWeight: '800' },

    tabsContainer: {
      marginBottom: SPACING.sm,
    },
    tabsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: SIZES.padding,
    },
    tabPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabPillActive: {
      backgroundColor: colors.primaryGreenLight,
      borderColor: colors.primaryGreen,
    },
    tabText: { ...TYPE.footnote, color: colors.textSecondary, fontWeight: '600' },
    tabTextActive: { color: colors.primaryGreen, fontWeight: '800' },

    countBadge: {
      backgroundColor: colors.bg,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 18,
      alignItems: 'center',
    },
    countBadgeActive: {
      backgroundColor: colors.primaryGreen,
    },
    countText: { fontSize: 11, color: colors.textSecondary, fontWeight: '700' },
    countTextActive: { color: '#FFFFFF', fontWeight: '800' },

    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    cardSkeleton: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
    },

    card: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.sm + 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    badge: {
      borderWidth: 1,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    badgeText: { ...TYPE.microLabel, fontSize: 10, fontWeight: '700' },
    categoryLabel: { ...TYPE.caption, color: colors.textSecondary },
    cardTitle: { ...TYPE.bodyStrong, fontSize: 14, color: colors.textPrimary, marginTop: 6, marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    metaText: { ...TYPE.caption, color: colors.textSecondary },
    dot: { ...TYPE.caption, color: colors.textSecondary },
    cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    expiryText: { ...TYPE.caption, color: colors.textSecondary },
    viewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primaryGreenLight,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: RADIUS.pill,
    },
    viewBtnText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },

    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs },
    emptyTitle: { ...TYPE.subheadStrong, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center' },
  });
