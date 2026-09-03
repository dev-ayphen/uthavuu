import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronDown, Globe, MapPin, Navigation, Search, X } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, ICON_SIZE, RADIUS, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { getMe, updateRadius as updateRadiusApi } from '@uthavu/libs-mobile/api/users';
import { getCommunityStats, getReportsSummary } from '@uthavu/libs-mobile/api/reports';
import { getMyMissions } from '@uthavu/libs-mobile/api/missions';
import { reverseGeocode } from '@uthavu/libs-mobile/lib/geocode';
import { useCategories } from '../../hooks/useCategories';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import Divider from '@uthavu/libs-mobile/components/Divider';
import Card from '@uthavu/libs-mobile/components/Card';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import { useConfig } from '../../hooks/useConfig';
import SponsorAd from '../../components/SponsorAd';

const RADIUS_OPTIONS = [1, 3, 5, 10] as const;

function greetingKeyForHour(hour: number): string {
  if (hour < 12) return 'dashboard.greetingMorning';
  if (hour < 17) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

// docs/mobile/08-dashboard-screen.md is 728 lines describing stats strips, an
// always-on fake "active mission", sponsor cards, and impact stories — all of
// that depends on features that don't exist yet (missions, monetization,
// stories). Building those here would mean fabricating data, which is exactly
// what got that prototype flagged throughout its own docs. What's real and
// built for real: the greeting, location, radius (persisted via a real API
// call), and category navigation.
export default function DashboardScreen() {
  const { colors } = useTheme();
  const { categories } = useCategories();
  const { t } = useTranslation(['tabs', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<
    CompositeNavigationProp<
      BottomTabNavigationProp<MainTabParamList>,
      NativeStackNavigationProp<RootStackParamList>
    >
  >();
  const queryClient = useQueryClient();
  // defaultRadiusKm — the fallback for someone who has never picked a radius.
  const config = useConfig();

  const {
    data: me,
    isError: meIsError,
    isFetching: meFetching,
    refetch: refetchMe,
  } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const radiusMutation = useMutation({
    mutationFn: updateRadiusApi,
    onSuccess: (updated) => queryClient.setQueryData(['me'], updated),
  });

  const [radiusModalOpen, setRadiusModalOpen] = useState(false);
  const [exploreModalOpen, setExploreModalOpen] = useState(false);
  const [exploring, setExploring] = useState<{ city: string; district: string; lat: number; lng: number } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const radius = me?.preferredRadius ?? config.defaultRadiusKm;
  const displayCity = exploring ? exploring.city : me?.city ?? 'your area';
  const displayDistrict = exploring ? exploring.district : me?.district ?? '';
  const effectiveLat = exploring ? exploring.lat : me?.lastLat;
  const effectiveLng = exploring ? exploring.lng : me?.lastLng;

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['reportsSummary', effectiveLat, effectiveLng, radius],
    queryFn: () => getReportsSummary(effectiveLat!, effectiveLng!, radius),
    enabled: effectiveLat != null && effectiveLng != null,
  });
  const countsByKey = new Map((summary ?? []).map((s) => [s.key, s]));
  // "Need Help"/"Urgent" are real sums of the same per-category counts
  // already driving the grid's badges — no separate fetch needed.
  const needHelpCount = (summary ?? []).reduce((sum, s) => sum + s.activeCount, 0);
  const urgentCount = (summary ?? []).reduce((sum, s) => sum + s.urgentCount, 0);

  const {
    data: communityStats,
    isLoading: communityStatsLoading,
    refetch: refetchCommunityStats,
  } = useQuery({
    queryKey: ['communityStats', effectiveLat, effectiveLng, radius],
    queryFn: () => getCommunityStats(effectiveLat!, effectiveLng!, radius),
    enabled: effectiveLat != null && effectiveLng != null,
  });

  // Same query key MyHelpsScreen.tsx already uses — shares one cache entry
  // rather than a redundant fetch just for this banner.
  const { data: myMissions, refetch: refetchMyMissions } = useQuery({
    queryKey: ['myMissions'],
    queryFn: getMyMissions,
  });
  // myStatus stays 'active' forever after a mission completes (mission-
  // completion.md BR-7, not a bug — completion never changes the
  // volunteer's own participation status, only the report's status does).
  // MyHelpsScreen's splitMissions() already accounts for this by also
  // checking reportStatus; this banner must too, or it keeps announcing a
  // completed mission as still in progress.
  const activeMission = (myMissions ?? [])
    .filter((m) => m.myStatus === 'active' && m.reportStatus !== 'completed')
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())[0];

  // BR-4 (discover-nearby-requests.md): no realtime — pull-to-refresh is the
  // only way to get fresh nearby-help counts short of leaving and reopening.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchMe(), refetchSummary(), refetchCommunityStats(), refetchMyMissions()]);
    setRefreshing(false);
  };

  const onSearchLocation = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const [result] = await Location.geocodeAsync(searchQuery.trim());
      if (!result) {
        setSearchError('No match found. Try a different place name.');
        return;
      }
      const { city, district } = await reverseGeocode(result.latitude, result.longitude);
      setExploring({
        city: city || searchQuery.trim(),
        district,
        lat: result.latitude,
        lng: result.longitude,
      });
      setExploreModalOpen(false);
      setSearchQuery('');
    } catch {
      setSearchError('Could not search that location. Try again.');
    } finally {
      setSearching(false);
    }
  };

  // `me` drives everything else on this screen (location, radius, the
  // category grid's own lat/lng) — a real failure with no cached data to
  // fall back on is worth a full-screen error, unlike `summary` alone
  // failing (that already degrades gracefully: the grid just shows no count
  // badges, still fully usable).
  if (meIsError && !me) {
    return <ErrorState onRetry={refetchMe} retrying={meFetching} />;
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.headerTop}>
          <Text style={styles.greeting}>
            {me?.name || t('dashboard.defaultName')} 👋
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('AlertsTab')}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.alertsLabel')}
            >
              <Bell size={18} color={COLORS.textOnTint} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('ProfileTab')}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.profileLabel')}
            >
              <Avatar uri={me?.avatarUrl} label={me?.name || 'H'} size={36} tone="inverse" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.locationRow}>
          {/* Location control — tapping opens Explore Location sheet */}
          <TouchableOpacity
            style={styles.locationControl}
            onPress={() => setExploreModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Change location"
          >
            {exploring ? (
              <Globe size={13} color={COLORS.info} />
            ) : (
              <MapPin size={13} color={COLORS.textOnTint} />
            )}
            <Text style={[styles.locationText, exploring && styles.locationTextExploring]} numberOfLines={1}>
              {displayCity === displayDistrict || !displayDistrict ? displayCity : `${displayCity}, ${displayDistrict}`}
            </Text>
            <ChevronDown size={12} color={exploring ? COLORS.info : COLORS.textOnTint} />
          </TouchableOpacity>

          {/* Radius control — tapping opens radius-only sheet */}
          <TouchableOpacity
            style={styles.radiusPill}
            onPress={() => setRadiusModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Search radius: ${radius} km`}
          >
            <Text style={{ fontSize: 10 }}>📍</Text>
            <Text style={styles.radiusPillText}>{t('dashboard.kmUnit', { km: radius })}</Text>
          </TouchableOpacity>
        </View>

        {/* Dashboard Stats Block — real: Need Help/Urgent are sums of the
            already-fetched per-category summary, Active Vols./Helped come
            from GET /reports/community-stats. */}
        <View style={styles.headerStatsBlock}>
          <View style={styles.headerStatCell}>
            {summaryLoading ? (
              <ActivityIndicator size="small" color={COLORS.textOnTint} />
            ) : (
              <Text style={styles.headerStatValue}>{needHelpCount}</Text>
            )}
            <Text style={styles.headerStatLabel}>Need Help</Text>
          </View>
          <Divider orientation="vertical" tone="onTint" />
          <View style={styles.headerStatCell}>
            {summaryLoading ? (
              <ActivityIndicator size="small" color={COLORS.textOnTint} />
            ) : (
              <Text style={styles.headerStatValue}>{urgentCount}</Text>
            )}
            <Text style={styles.headerStatLabel}>Urgent</Text>
          </View>
          <Divider orientation="vertical" tone="onTint" />
          <View style={styles.headerStatCell}>
            {communityStatsLoading ? (
              <ActivityIndicator size="small" color={COLORS.textOnTint} />
            ) : (
              <Text style={styles.headerStatValue}>{communityStats?.activeVolunteers ?? 0}</Text>
            )}
            <Text style={styles.headerStatLabel}>Active Vols.</Text>
          </View>
          <Divider orientation="vertical" tone="onTint" />
          <View style={styles.headerStatCell}>
            {communityStatsLoading ? (
              <ActivityIndicator size="small" color={COLORS.textOnTint} />
            ) : (
              <Text style={styles.headerStatValue}>{communityStats?.helped ?? 0}</Text>
            )}
            <Text style={styles.headerStatLabel}>Helped</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGreen} />
        }
      >
        {/* Active Mission Live Banner — only when this user genuinely has an
            active mission right now; absent otherwise, not a fallback state. */}
        {activeMission && (
          <TouchableOpacity
            style={styles.activeMissionBanner}
            onPress={() => navigation.navigate('VolunteerJourney', { reportId: activeMission.reportId })}
            accessibilityRole="button"
            accessibilityLabel={`Active mission: ${activeMission.title}`}
          >
            <View style={styles.activeMissionHeader}>
              <Text style={styles.activeMissionTag}>ACTIVE MISSION IN PROGRESS</Text>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.activeMissionTitleRow}>
              <View style={styles.activeGreenDot} />
              <Text style={styles.activeMissionTitle}>
                {activeMission.category.emoji} {activeMission.title}
              </Text>
            </View>
            <Text style={styles.activeMissionSub}>Mission active · Tap to view and update</Text>
          </TouchableOpacity>
        )}

        {exploring && (
          <View style={styles.exploringBanner}>
            <Text style={styles.exploringBannerText}>
              {t('dashboard.exploringBanner', { city: exploring.city })}
            </Text>
            <TouchableOpacity
              onPress={() => setExploring(null)}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.resetLocationLabel')}
            >
              <Text style={styles.exploringReset}>{t('dashboard.reset')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.sectionHeaderContainer}>
          <View>
            <Text style={styles.sectionTitle}>
              {exploring ? t('dashboard.helpRequestsIn', { city: exploring.city }) : t('dashboard.helpRequestsNearby')}
            </Text>
            <Text style={styles.sectionSubtitle}>
              🟢 {t('dashboard.withinKm', { radius, location: displayCity })}
            </Text>
          </View>
          <View style={styles.categoriesBadgePill}>
            {/* Counted, not asserted. This said "8 Categories" while the grid
                rendered whatever the server sent — so an admin adding a ninth
                produced a grid of 9 under a label reading 8. */}
            <Text style={styles.categoriesBadgeText}>
              {categories.length} {categories.length === 1 ? 'Category' : 'Categories'}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          {categories.map((cat) => {
            const counts = countsByKey.get(cat.id);
            return (
              <Card
                key={cat.id}
                style={styles.card}
                onPress={() =>
                  effectiveLat != null &&
                  effectiveLng != null &&
                  navigation.navigate('CategoryList', {
                    categoryKey: cat.id,
                    lat: effectiveLat,
                    lng: effectiveLng,
                    radiusKm: radius,
                    locationLabel: displayCity,
                  })
                }
                accessibilityLabel={cat.title}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.cardIconBox, { backgroundColor: cat.color + '20' }]}>
                    <Text style={styles.cardEmoji}>{cat.emoji}</Text>
                  </View>
                  {summaryLoading ? (
                    <Skeleton width={22} height={22} borderRadius={11} />
                  ) : (
                    <View style={[styles.countBadge, (counts?.urgentCount ?? 0) > 0 && styles.countBadgeUrgent]}>
                      <Text style={styles.countBadgeText}>• {counts?.activeCount ?? 0}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardTitle}>{cat.title}</Text>
                {summaryLoading ? (
                  <Skeleton width={60} height={14} style={{ marginTop: 2 }} />
                ) : (
                  <Text style={styles.cardActiveSub}>{counts?.activeCount ?? 0} Active</Text>
                )}
                <View style={styles.cardViewRow}>
                  <Text style={styles.cardViewText}>View →</Text>
                </View>
              </Card>
            );
          })}
        </View>

        {/* Sponsor slot — LAST child of the feed, deliberately. It sits below the
            active-mission banner and below every category tile, so a paid card
            can never push a real help request further from the user's thumb.
            Renders nothing at all unless the backend returns a live campaign. */}
        <SponsorAd placement="home" style={styles.sponsorAd} />
      </ScrollView>

      {/* ── Radius bottom sheet — only radius, auto-close on select ── */}
      <Modal visible={radiusModalOpen} transparent animationType="slide" onRequestClose={() => setRadiusModalOpen(false)}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setRadiusModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Nearby Search Radius</Text>
            <Text style={styles.sheetSub}>
              Showing help requests around{exploring ? ` ${exploring.city}` : ' your current location'}.
            </Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map((km) => (
                <TouchableOpacity
                  key={km}
                  style={[styles.radiusOption, radius === km && styles.radiusOptionActive]}
                  onPress={() => {
                    radiusMutation.mutate(km);
                    setRadiusModalOpen(false); // auto-close on select
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={`${km} km`}
                  accessibilityState={{ checked: radius === km }}
                >
                  <Text style={[styles.radiusOptionText, radius === km && styles.radiusOptionTextActive]}>
                    {km} km{radius === km ? '  ✓' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Explore Location sheet — WHERE control ── */}
      <Modal visible={exploreModalOpen} transparent animationType="slide" onRequestClose={() => setExploreModalOpen(false)}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setExploreModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Explore Location</Text>
              <TouchableOpacity onPress={() => setExploreModalOpen(false)} style={styles.sheetCloseBtn}>
                <X size={16} color={colors.textSecondary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Search box */}
            <View style={styles.searchBox}>
              <Search size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search city, area or locality"
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={onSearchLocation}
                returnKeyType="search"
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={colors.primaryGreen} />}
              {searchQuery.length > 0 && !searching && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            {searchError ? <Text style={styles.searchError}>{searchError}</Text> : null}

            {/* Use current location */}
            {exploring && (
              <TouchableOpacity
                style={styles.currentLocRow}
                onPress={() => {
                  setExploring(null);
                  setExploreModalOpen(false);
                }}
              >
                <View style={styles.currentLocIconBox}>
                  <Navigation size={15} color={colors.primaryGreen} />
                </View>
                <View style={styles.currentLocTextBlock}>
                  <Text style={styles.currentLocLabel}>Use my current location</Text>
                  <Text style={styles.currentLocSub}>
                    {me?.city ?? 'Your GPS location'}{me?.district && me.district !== me.city ? `, ${me.district}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Popular locations */}
            <Text style={styles.popularLabel}>Popular Locations</Text>
            {[
              { city: 'Chennai', district: 'Chennai', lat: 13.0827, lng: 80.2707 },
              { city: 'Madurai', district: 'Madurai', lat: 9.9252, lng: 78.1198 },
              { city: 'Coimbatore', district: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
              { city: 'Salem', district: 'Salem', lat: 11.6643, lng: 78.1460 },
              { city: 'Trichy', district: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
              { city: 'Tirunelveli', district: 'Tirunelveli', lat: 8.7139, lng: 77.7567 },
            ].map((loc, idx) => (
              <TouchableOpacity
                key={loc.city}
                style={[styles.popularRow, idx > 0 && styles.popularRowDivider]}
                onPress={() => {
                  setExploring({ city: loc.city, district: loc.district, lat: loc.lat, lng: loc.lng });
                  setExploreModalOpen(false);
                  setSearchQuery('');
                }}
              >
                <MapPin size={13} color={colors.textSecondary} />
                <Text style={styles.popularCity}>{loc.city}</Text>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      backgroundColor: COLORS.bgInverse,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.md,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    greeting: { ...TYPE.headlineStrong, fontSize: 17, color: COLORS.textOnTint, flexShrink: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.round,
      backgroundColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
      marginBottom: SPACING.sm,
      gap: SPACING.xs,
    },
    locationControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexShrink: 1,
      flex: 1,
    },
    locationText: { ...TYPE.subheadStrong, fontSize: 13, color: COLORS.textOnTint, flexShrink: 1 },
    locationTextExploring: { color: COLORS.info },
    radiusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs - 2,
      minHeight: 30,
      flexShrink: 0,
    },
    radiusPillText: { ...TYPE.captionStrong, fontSize: 12, color: COLORS.textOnTint, fontWeight: '700' },
    body: { flex: 1 },
    bodyContent: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },
    exploringBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: COLORS.infoBg,
      borderWidth: 1,
      borderColor: COLORS.infoBorder,
      borderRadius: RADIUS.lg,
      padding: SPACING.sm,
      marginBottom: SPACING.md,
    },
    exploringBannerText: { ...TYPE.footnoteRegular, color: COLORS.infoStrong, flexShrink: 1 },
    exploringReset: { ...TYPE.footnote, color: COLORS.infoStrong },
    headerStatsBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.xs + 2,
      paddingHorizontal: SPACING.xs,
      marginTop: 2,
    },
    headerStatCell: {
      alignItems: 'center',
      flex: 1,
    },
    headerStatValue: {
      ...TYPE.title,
      fontSize: 16,
      fontWeight: '800',
      color: COLORS.textOnTint,
    },
    headerStatLabel: {
      ...TYPE.caption,
      fontSize: 10,
      color: 'rgba(255,255,255,0.7)',
      marginTop: 1,
    },
    activeMissionBanner: {
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: '#A7F3D0',
      borderRadius: RADIUS.xl,
      padding: SPACING.sm + 2,
      marginBottom: SPACING.md,
    },
    activeMissionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    activeMissionTag: {
      ...TYPE.microLabel,
      fontSize: 9,
      color: '#047857',
      letterSpacing: 0.5,
    },
    liveBadge: {
      backgroundColor: '#10B981',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: RADIUS.pill,
    },
    liveBadgeText: {
      ...TYPE.microLabel,
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 8.5,
    },
    activeMissionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 1,
    },
    activeGreenDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#10B981',
    },
    activeMissionTitle: {
      ...TYPE.bodyStrong,
      fontSize: 13.5,
      color: '#064E3B',
      flexShrink: 1,
    },
    activeMissionSub: {
      ...TYPE.caption,
      fontSize: 11,
      color: '#047857',
      marginTop: 2,
    },
    sectionHeaderContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: SPACING.xs,
    },
    categoriesBadgePill: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs - 2,
      borderRadius: RADIUS.pill,
    },
    categoriesBadgeText: {
      ...TYPE.footnote,
      color: '#15803D',
      fontWeight: '700',
    },
    sectionTitle: { ...TYPE.title, fontSize: 18, color: colors.textPrimary, fontWeight: '800' },
    sectionSubtitle: {
      ...TYPE.footnoteRegular,
      color: colors.textSecondary,
      marginTop: SPACING.xxs / 2,
      marginBottom: SPACING.sm,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    sponsorAd: { marginTop: SPACING.lg },
    card: { width: '47%', padding: SPACING.md, borderRadius: RADIUS.xxl },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardIconBox: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.xl,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    cardEmoji: { fontSize: 22 },
    countBadge: {
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
      backgroundColor: '#FEE2E2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
      justifyContent: 'center',
      alignItems: 'center',
    },
    countBadgeUrgent: { backgroundColor: TONES.critical.fill, borderColor: TONES.critical.border },
    countBadgeText: { ...TYPE.microLabel, color: '#DC2626', fontWeight: '700' },
    cardTitle: { ...TYPE.bodyStrong, fontSize: 14, color: colors.textPrimary, marginTop: 2 },
    cardActiveSub: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2 },
    cardViewRow: { marginTop: SPACING.xs },
    cardViewText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      padding: SPACING.md,
      paddingBottom: SPACING.xxl,
    },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: SPACING.sm },
    sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    sheetTitle: { ...TYPE.headlineStrong, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
    sheetSub: { ...TYPE.caption, color: colors.textSecondary, marginBottom: SPACING.md, marginTop: 2 },
    sheetCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
    radiusRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.xs },
    radiusOption: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.xl,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    radiusOptionActive: { backgroundColor: colors.primaryGreen, borderColor: colors.primaryGreen },
    radiusOptionText: { ...TYPE.subheadStrong, fontWeight: '600', color: colors.textSecondary },
    radiusOptionTextActive: { color: colors.textOnTint },
    radiusCheckmark: { fontSize: 11, color: colors.textOnTint, fontWeight: '800' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.sm,
      height: 42,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    searchInput: { flex: 1, ...TYPE.subhead, color: colors.textPrimary },
    searchError: { ...TYPE.footnoteRegular, color: colors.danger, marginTop: SPACING.xs },
    currentLocRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs, marginBottom: SPACING.xs },
    currentLocIconBox: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: colors.primaryGreenLight, alignItems: 'center', justifyContent: 'center' },
    currentLocTextBlock: { flex: 1 },
    currentLocLabel: { ...TYPE.footnote, fontWeight: '700', color: colors.primaryGreen },
    currentLocSub: { ...TYPE.microLabel, color: colors.textSecondary },
    popularLabel: { ...TYPE.microLabel, fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, marginTop: SPACING.xs },
    popularRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs + 2 },
    popularRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    popularCity: { ...TYPE.subheadStrong, fontSize: 14, color: colors.textPrimary },
  });
