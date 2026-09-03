import { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Clock, PackageOpen, Search, Share2, SlidersHorizontal } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, RADIUS, SIZES, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { listReports, type ReportWithDistance } from '@uthavu/libs-mobile/api/reports';
import { useCategories } from '../../hooks/useCategories';
import { formatTimeRemaining, getUrgencyTone } from '@uthavu/libs-mobile/lib/urgency';
import { formatRelativeTime } from '@uthavu/libs-mobile/lib/time';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import { useConfig } from '../../hooks/useConfig';
import SponsorAd from '../../components/SponsorAd';

type Props = NativeStackScreenProps<RootStackParamList, 'CategoryList'>;

export default function CategoryListScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['tabs', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = useConfig();
  const { categoryKey, lat, lng, radiusKm, locationLabel } = route.params;
  const { categories } = useCategories();
  const categoryMeta = categories.find((c) => c.id === categoryKey);

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedDistance, setSelectedDistance] = useState<number>(radiusKm ?? config.defaultRadiusKm);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open Only' | 'Urgent'>('All');
  const [sortBy, setSortBy] = useState<'Nearby' | 'Newest' | 'Most Urgent'>('Nearby');

  const { data: reportsList, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['reports', categoryKey, lat, lng, selectedDistance],
    queryFn: () => listReports(categoryKey, lat, lng, selectedDistance),
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  /*
   * Search, status and sort are applied HERE, over the fetched page, rather
   * than sent to the API — GET /reports takes categoryKey/lat/lng/radiusKm and
   * nothing else, and inventing query params the server ignores is how these
   * controls came to be decorative in the first place. Distance stays server-
   * side because radiusKm is a real parameter and a wider radius needs more
   * rows, not a different filter over the same ones.
   *
   * "Urgent" and "Most Urgent" both defer to getUrgencyTone(), the same
   * expiry-derived definition the report cards and the Home tab already use,
   * so a request called urgent in one place is urgent everywhere.
   */
  const visibleReports = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = (reportsList ?? []).filter((r) => {
      if (query) {
        const haystack = `${r.title} ${r.description} ${r.landmark ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (statusFilter === 'Open Only' && r.status !== 'open') return false;
      if (statusFilter === 'Urgent') {
        const tone = getUrgencyTone(r.expiryAt);
        if (tone !== 'critical' && tone !== 'soon') return false;
      }
      return true;
    });

    // Copy before sorting — Array.prototype.sort mutates, and this array is
    // React Query's cached data.
    return [...filtered].sort((a, b) => {
      if (sortBy === 'Newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'Most Urgent') {
        return new Date(a.expiryAt).getTime() - new Date(b.expiryAt).getTime();
      }
      return a.distanceKm - b.distanceKm;
    });
  }, [reportsList, searchQuery, statusFilter, sortBy]);

  const filtersAreDefault =
    searchQuery.trim() === '' && statusFilter === 'All' && sortBy === 'Nearby';

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setSortBy('Nearby');
    setSelectedDistance(radiusKm ?? config.defaultRadiusKm);
  };


  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      {/* Top Navigation Bar */}
      <View style={styles.headerRow}>
        <BackButton />
        <TouchableOpacity
          style={styles.headerTitleGroup}
          onPress={() => setCategoryPickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.categoryEmoji}>{categoryMeta?.emoji}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{categoryMeta?.title}</Text>
          <ChevronDown size={16} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Search and Filter Row */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${categoryMeta?.title.toLowerCase()} requests...`}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalOpen(true)}
          accessibilityLabel="Filter and sort"
        >
          <SlidersHorizontal size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <ReportRowSkeleton key={i} styles={styles} />
          ))}
        </View>
      ) : isError && !reportsList ? (
        <ErrorState onRetry={refetch} retrying={isFetching} />
      ) : (
        <FlatList
          data={visibleReports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingTop: SPACING.md }]}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primaryGreen} />
          }
          ListEmptyComponent={
            /*
             * Two different empty states, because they mean different things and
             * have different exits. "Nothing within 5 km" is the world being
             * quiet; "nothing matches your filters" is the user having narrowed
             * themselves into a corner, and the way out is a button, not a pull
             * to refresh. Showing the first message for the second case told
             * people no one nearby needed help when the API had returned rows.
             */
            <View style={styles.empty}>
              <PackageOpen size={40} color={colors.textSecondary} strokeWidth={1.5} />
              {filtersAreDefault ? (
                <>
                  <Text style={styles.emptyTitle}>{t('categoryList.emptyTitle')}</Text>
                  <Text style={styles.emptySubtitle}>
                    {t('categoryList.emptySubtitle', {
                      category: categoryMeta?.title.toLowerCase(),
                      radius: selectedDistance,
                    })}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>{t('common:noFilterMatches')}</Text>
                  <Text style={styles.emptySubtitle}>{t('common:noFilterMatchesHint')}</Text>
                  <TouchableOpacity onPress={resetFilters} accessibilityRole="button">
                    <Text style={styles.clearFiltersText}>{t('common:clearFilters')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
          /* Sponsor slot — FOOTER, never a header. An ad above this list would
             push real, possibly urgent help requests below the fold, which the
             help-flow rule forbids. Renders nothing unless a campaign exists;
             the contentContainer's own gap means a null render leaves no space. */
          ListFooterComponent={<SponsorAd placement="category_list" />}
          renderItem={({ item }) => (
            <ReportRow
              report={item}
              colors={colors}
              styles={styles}
              t={t}
              onPress={() => navigation.navigate('RequestDetails', { reportId: item.id })}
            />
          )}
        />
      )}

      {/* Filter Bottom Sheet Modal */}
      <Modal visible={filterModalOpen} transparent animationType="slide" onRequestClose={() => setFilterModalOpen(false)}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setFilterModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter Requests</Text>

            <Text style={styles.filterSectionTitle}>📍 Distance</Text>
            <View style={styles.distanceOptionsRow}>
              {[1, 3, 5, 10].map((km) => {
                const isSelected = selectedDistance === km;
                return (
                  <TouchableOpacity
                    key={km}
                    style={[styles.distancePill, isSelected && styles.distancePillActive]}
                    onPress={() => setSelectedDistance(km)}
                  >
                    <Text style={[styles.distancePillText, isSelected && styles.distancePillTextActive]}>{km} km</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterSectionTitle}>Status</Text>
            {(['All', 'Open Only', 'Urgent'] as const).map((status) => (
              <TouchableOpacity
                key={status}
                style={styles.radioOptionRow}
                onPress={() => setStatusFilter(status)}
              >
                <View style={[styles.radioOuter, statusFilter === status && styles.radioOuterActive]}>
                  {statusFilter === status && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioText}>{status}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.filterSectionTitle}>Sort By</Text>
            {(['Nearby', 'Newest', 'Most Urgent'] as const).map((sort) => (
              <TouchableOpacity
                key={sort}
                style={styles.radioOptionRow}
                onPress={() => setSortBy(sort)}
              >
                <View style={[styles.radioOuter, sortBy === sort && styles.radioOuterActive]}>
                  {sortBy === sort && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioText}>{sort}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.filterModalButtonRow}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Text style={styles.resetBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterModalOpen(false)}>
                <Text style={styles.applyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Category Dropdown Picker Modal */}
      <Modal visible={categoryPickerOpen} transparent animationType="slide" onRequestClose={() => setCategoryPickerOpen(false)}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setCategoryPickerOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Category</Text>
            <ScrollView contentContainerStyle={styles.categoryPickerList} showsVerticalScrollIndicator={false}>
              {categories.map((cat) => {
                const isSelected = cat.id === categoryKey;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryPickerRow, isSelected && styles.categoryPickerRowActive]}
                    onPress={() => {
                      setCategoryPickerOpen(false);
                      navigation.replace('CategoryList', {
                        categoryKey: cat.id,
                        lat,
                        lng,
                        radiusKm: (selectedDistance ?? config.defaultRadiusKm) as 1 | 3 | 5 | 10,
                        locationLabel,
                      });
                    }}
                  >
                    <Text style={styles.categoryPickerEmoji}>{cat.emoji}</Text>
                    <Text style={[styles.categoryPickerText, isSelected && styles.categoryPickerTextActive]}>
                      {cat.title}
                    </Text>
                    {isSelected && <Text style={styles.categoryPickerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function ReportRow({
  report,
  colors,
  styles,
  t,
  onPress,
}: {
  report: ReportWithDistance;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  t: TFunction;
  onPress: () => void;
}) {
  const tone = TONES[getUrgencyTone(report.expiryAt)];

  const reporterInitial =
    !report.reporterDeleted && report.reporter?.name ? report.reporter.name[0].toUpperCase() : '?';
  const reporterLabel = report.reporterDeleted
    ? t('myHelps.postedByDeletedUser')
    : report.reporter?.name
      ? t('myHelps.postedBy', { name: report.reporter.name })
      : t('myHelps.postedAnonymously');

  const onShare = async () => {
    const link = `uthavu://requests/${report.id}`;
    try {
      await Share.share({
        message: `${t('categoryList.shareMessage', { title: report.title })} ${link}`,
        url: link,
      });
    } catch {
      // dismissed/failed share isn't a real error
    }
  };

  return (
    <TouchableOpacity
      style={styles.requestCard}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={t('categoryList.rowLabel', {
        title: report.title,
        distance: report.distanceKm,
        time: formatTimeRemaining(report.expiryAt),
      })}
    >
      {/* Urgency Badge */}
      <View style={styles.cardBadgesHeader}>
        <View style={[styles.expiryBadge, { backgroundColor: tone.fill, borderColor: tone.border }]}>
          <Clock size={12} color={tone.fg} />
          <Text style={[styles.expiryText, { color: tone.fg }]}>{formatTimeRemaining(report.expiryAt)}</Text>
        </View>
      </View>

      {/* Main Request Image (only rendered if photo exists) */}
      {report.photos && report.photos[0] ? (
        <Image source={{ uri: report.photos[0] }} style={styles.cardImage} />
      ) : null}

      {/* Title & Reporter Metadata */}
      <Text style={styles.cardTitle}>{report.title}</Text>
      <View style={styles.reporterRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{reporterInitial}</Text>
        </View>
        <Text style={styles.reporterName} numberOfLines={1}>{reporterLabel}</Text>
      </View>

      <View style={styles.locationMetaRow}>
        {report.landmark && (
          <>
            <Text style={styles.metaIcon}>📍</Text>
            <Text style={styles.metaText}>{report.landmark}</Text>
            <Text style={styles.reporterDot}>•</Text>
          </>
        )}
        <Text style={styles.metaText}>{t('categoryList.distanceAway', { distance: report.distanceKm })}</Text>
        <Text style={styles.reporterDot}>•</Text>
        <Clock size={12} color={colors.textSecondary} />
        <Text style={styles.metaText}>{formatRelativeTime(report.createdAt)}</Text>
      </View>

      {/* Card Action Buttons */}
      <View style={styles.cardActionsRow}>
        <TouchableOpacity style={styles.actionPillBtn} onPress={onShare}>
          <Share2 size={14} color={colors.primaryGreen} />
          <Text style={styles.actionPillTextGreen}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.viewDetailsBtn} onPress={onPress}>
          <Text style={styles.viewDetailsText}>View Details ›</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ReportRowSkeleton({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.requestCard}>
      <Skeleton width="100%" height={150} borderRadius={RADIUS.lg} />
      <Skeleton width="70%" height={16} style={{ marginTop: SPACING.sm }} />
      <Skeleton width="90%" height={12} style={{ marginTop: SPACING.xxs }} />
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
      gap: SPACING.xs,
    },
    headerTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
    },
    categoryEmoji: { fontSize: 18 },
    headerTitle: { ...TYPE.title, fontSize: 16, color: colors.textPrimary, fontWeight: '800', flexShrink: 1 },
    searchContainer: {
      flexDirection: 'row',
      paddingHorizontal: SIZES.padding,
      gap: SPACING.xs,
      marginTop: SPACING.sm,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.md,
      height: 44,
    },
    searchInput: { flex: 1, ...TYPE.subhead, color: colors.textPrimary },
    filterButton: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    radiusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: SIZES.padding,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    radiusPin: { fontSize: 12 },
    radiusText: { ...TYPE.footnote, color: colors.textSecondary, fontWeight: '600' },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.md },

    /* Request Card Styles */
    requestCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
    },
    cardBadgesHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    expiryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderWidth: 1,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
    },
    expiryText: { ...TYPE.microLabel, fontWeight: '700' },
    cardImage: {
      width: '100%',
      height: 160,
      borderRadius: RADIUS.xl,
      marginBottom: SPACING.sm,
    },
    cardImagePlaceholder: {
      backgroundColor: COLORS.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { ...TYPE.headlineStrong, fontSize: 16, color: colors.textPrimary, marginBottom: SPACING.xxs },
    reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.xxs },
    avatarCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#475569',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: { ...TYPE.microLabel, color: '#FFFFFF', fontSize: 10 },
    reporterName: { ...TYPE.footnote, color: colors.textPrimary, fontWeight: '700' },
    reporterDot: { ...TYPE.caption, color: colors.textSecondary },
    locationMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.md },
    metaIcon: { fontSize: 11 },
    metaText: { ...TYPE.caption, color: colors.textSecondary },
    cardActionsRow: { flexDirection: 'row', gap: SPACING.xs, alignItems: 'center' },
    actionPillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: COLORS.bgMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs - 2,
    },
    actionPillTextGreen: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },
    viewDetailsBtn: {
      backgroundColor: colors.primaryGreen,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs - 2,
      marginLeft: 'auto',
    },
    viewDetailsText: { ...TYPE.footnote, color: '#FFFFFF', fontWeight: '700' },

    /* Filter Modal Sheet */
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'flex-end' },
    sheetContainer: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.pill,
      borderTopRightRadius: RADIUS.pill,
      padding: SPACING.lg,
      paddingBottom: SPACING.xxl,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: SPACING.md,
    },
    sheetTitle: { ...TYPE.title, fontSize: 18, color: colors.textPrimary, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.md },
    filterSectionTitle: { ...TYPE.footnote, color: colors.textPrimary, fontWeight: '700', marginTop: SPACING.sm, marginBottom: SPACING.xs },
    distanceOptionsRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm },
    distancePill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    distancePillActive: {
      borderColor: colors.primaryGreen,
      backgroundColor: '#DCFCE7',
    },
    distancePillText: { ...TYPE.footnote, color: colors.textSecondary, fontWeight: '600' },
    distancePillTextActive: { color: colors.primaryGreen, fontWeight: '700' },
    radioOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.xs,
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    radioOuterActive: { borderColor: colors.primaryGreen },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryGreen },
    radioText: { ...TYPE.bodyStrong, color: colors.textPrimary },
    filterModalButtonRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
    resetBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
    },
    resetBtnText: { ...TYPE.subheadStrong, color: colors.textSecondary },
    applyBtn: {
      flex: 2,
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.primaryGreen,
    },
    applyBtnText: { ...TYPE.subheadStrong, color: '#FFFFFF', fontWeight: '700' },

    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs, paddingHorizontal: SPACING.xl },
    emptyTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
    clearFiltersText: { ...TYPE.captionStrong, color: colors.primaryGreen, marginTop: SPACING.sm },

    /* Category Picker Styles */
    categoryPickerList: { paddingBottom: SPACING.lg, gap: 2 },
    categoryPickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
    },
    categoryPickerRowActive: { backgroundColor: colors.primaryGreenLight },
    categoryPickerEmoji: { fontSize: 18, marginRight: SPACING.xs + 2 },
    categoryPickerText: { flex: 1, ...TYPE.subheadStrong, color: colors.textPrimary },
    categoryPickerTextActive: { color: colors.primaryGreen, fontWeight: '800' },
    categoryPickerCheck: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '800' },
  });

