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
import { Bell, Compass, Globe, MapPin, Search, SlidersHorizontal } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import type { RootStackParamList } from '../../navigation/types';
import type { MainTabParamList } from '../../navigation/tabTypes';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { COLORS, RADIUS, SPACING, TONES, TYPE } from '../../theme/tokens';
import { getMe, updateRadius as updateRadiusApi } from '../../api/users';
import { getReportsSummary } from '../../api/reports';
import { reverseGeocode } from '../../lib/geocode';
import { CATEGORIES } from '../../data/categories';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Skeleton from '../../components/Skeleton';

const RADIUS_OPTIONS = [1, 3, 5, 10] as const;

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<
    CompositeNavigationProp<
      BottomTabNavigationProp<MainTabParamList>,
      NativeStackNavigationProp<RootStackParamList>
    >
  >();
  const queryClient = useQueryClient();

  const { data: me, refetch: refetchMe } = useQuery({ queryKey: ['me'], queryFn: getMe });
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

  const radius = me?.preferredRadius ?? 5;
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

  // BR-4 (discover-nearby-requests.md): no realtime — pull-to-refresh is the
  // only way to get fresh nearby-help counts short of leaving and reopening.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchMe(), refetchSummary()]);
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

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.headerTop}>
          <Text style={styles.greeting}>
            {greetingForHour(new Date().getHours())}, {me?.name?.split(' ')[0] || 'there'} 👋
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('AlertsTab')}
              accessibilityRole="button"
              accessibilityLabel="Alerts"
            >
              <Bell size={18} color={COLORS.textOnTint} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('ProfileTab')}
              accessibilityRole="button"
              accessibilityLabel="Profile"
            >
              <Avatar uri={me?.avatarUrl} label={me?.name || 'U'} size={36} tone="inverse" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.locationRow}
          onPress={() => setRadiusModalOpen(true)}
          accessibilityRole="button"
        >
          {exploring ? (
            <Globe size={14} color={COLORS.info} />
          ) : (
            <MapPin size={14} color={COLORS.textOnTint} />
          )}
          <Text style={[styles.locationText, exploring && styles.locationTextExploring]}>
            {displayCity}
            {displayDistrict ? `, ${displayDistrict}` : ''}
          </Text>
          <View style={styles.radiusPill}>
            <SlidersHorizontal size={10} color={COLORS.textOnTint} />
            <Text style={styles.radiusPillText}>{radius} km</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGreen} />
        }
      >
        {exploring && (
          <View style={styles.exploringBanner}>
            <Text style={styles.exploringBannerText}>
              🌍 Exploring {exploring.city} — not your current location
            </Text>
            <TouchableOpacity onPress={() => setExploring(null)}>
              <Text style={styles.exploringReset}>Reset</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          {exploring ? `Help Requests in ${exploring.city}` : 'Help Requests Nearby'}
        </Text>
        <Text style={styles.sectionSubtitle}>
          Within {radius} km · {displayCity}
        </Text>

        <View style={styles.grid}>
          {CATEGORIES.map((cat) => {
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
                    !!counts?.activeCount && (
                      <View style={[styles.countBadge, counts.urgentCount > 0 && styles.countBadgeUrgent]}>
                        <Text style={styles.countBadgeText}>{counts.activeCount}</Text>
                      </View>
                    )
                  )}
                </View>
                <Text style={styles.cardTitle}>{cat.title}</Text>
              </Card>
            );
          })}
        </View>
      </ScrollView>

      {/* Radius bottom sheet */}
      <Modal visible={radiusModalOpen} transparent animationType="slide" onRequestClose={() => setRadiusModalOpen(false)}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setRadiusModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>📍 Nearby Search Radius</Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map((km) => (
                <TouchableOpacity
                  key={km}
                  style={[styles.radiusOption, radius === km && styles.radiusOptionActive]}
                  onPress={() => radiusMutation.mutate(km)}
                >
                  <Text style={[styles.radiusOptionText, radius === km && styles.radiusOptionTextActive]}>
                    {km} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.exploreButton}
              onPress={() => {
                setRadiusModalOpen(false);
                setExploreModalOpen(true);
              }}
            >
              <Compass size={16} color={colors.primaryGreen} />
              <Text style={styles.exploreButtonText}>Explore Another Location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneButton} onPress={() => setRadiusModalOpen(false)}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Explore-another-location sheet */}
      <Modal visible={exploreModalOpen} transparent animationType="slide" onRequestClose={() => setExploreModalOpen(false)}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setExploreModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Search a location</Text>
            <View style={styles.searchBox}>
              <Search size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search city, area or town…"
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={onSearchLocation}
                returnKeyType="search"
              />
              {searching && <ActivityIndicator size="small" color={colors.primaryGreen} />}
            </View>
            {searchError ? <Text style={styles.searchError}>{searchError}</Text> : null}
            <TouchableOpacity
              style={[styles.doneButton, styles.cancelButtonSpacing]}
              onPress={() => setExploreModalOpen(false)}
            >
              <Text style={styles.doneButtonText}>Cancel</Text>
            </TouchableOpacity>
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
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    headerTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    greeting: { ...TYPE.headlineStrong, color: COLORS.textOnTint, flexShrink: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs + 2 },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.round,
      backgroundColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    locationText: { ...TYPE.subheadStrong, color: COLORS.textOnTint, flexShrink: 1 },
    locationTextExploring: { color: COLORS.info },
    radiusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xxs,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs,
      marginLeft: 'auto',
    },
    radiusPillText: { ...TYPE.captionStrong, color: COLORS.textOnTint, fontWeight: '700' },
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
    sectionTitle: { ...TYPE.title, color: colors.textPrimary },
    sectionSubtitle: {
      ...TYPE.footnoteRegular,
      color: colors.textSecondary,
      marginTop: SPACING.xxs / 2,
      marginBottom: SPACING.md,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    card: { width: '47%' },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardIconBox: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.lg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    cardEmoji: { fontSize: 20 },
    countBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: SPACING.xxs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    countBadgeUrgent: { backgroundColor: TONES.critical.fill, borderColor: TONES.critical.border },
    countBadgeText: { ...TYPE.captionStrong, color: colors.textPrimary },
    cardTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.pill,
      borderTopRightRadius: RADIUS.pill,
      padding: SPACING.lg,
      paddingBottom: SPACING.xxl,
    },
    sheetTitle: { ...TYPE.screenTitle, fontWeight: '800', color: colors.textPrimary, marginBottom: SPACING.md },
    radiusRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.md },
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
    exploreButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.primaryGreenLight,
      borderWidth: 1,
      borderColor: COLORS.accentSubtleBorder,
      borderRadius: RADIUS.xl,
      paddingVertical: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    exploreButtonText: { ...TYPE.subheadStrong, fontWeight: '600', color: colors.primaryGreen },
    doneButton: {
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.bgElevated,
    },
    cancelButtonSpacing: { marginTop: SPACING.md },
    doneButtonText: { ...TYPE.subheadStrong, fontWeight: '600', color: colors.textSecondary },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      height: 44,
    },
    searchInput: { flex: 1, ...TYPE.subhead, color: colors.textPrimary },
    searchError: { ...TYPE.footnoteRegular, color: colors.danger, marginTop: SPACING.xs },
  });
