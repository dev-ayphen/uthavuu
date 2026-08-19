import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, MapPin, PackageOpen } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TONES, TYPE } from '../../theme/tokens';
import { listReports, type ReportWithDistance } from '../../api/reports';
import { CATEGORIES } from '../../data/categories';
import { formatTimeRemaining, getUrgencyTone } from '../../lib/urgency';
import BackButton from '../../components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'CategoryList'>;

// docs/features/discover-nearby-requests.md US-3 — shared with
// report-a-request.md's "Category list" screen (same route serves both
// "browse" and "where do I report this"). BR-4: no realtime, so freshness
// comes from pull-to-refresh + refetch-on-focus only, both wired below.
export default function CategoryListScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { categoryKey, lat, lng, radiusKm, locationLabel } = route.params;
  const categoryMeta = CATEGORIES.find((c) => c.id === categoryKey);

  const { data: reportsList, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['reports', categoryKey, lat, lng, radiusKm],
    queryFn: () => listReports(categoryKey, lat, lng, radiusKm),
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>
          {categoryMeta?.emoji} {categoryMeta?.title}
        </Text>
        <Text style={styles.subtitle}>
          Within {radiusKm} km · {locationLabel}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.primaryGreen} />
      ) : (
        <FlatList
          data={reportsList ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isFetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.empty}>
              <PackageOpen size={40} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>Nothing open right now</Text>
              <Text style={styles.emptySubtitle}>
                No {categoryMeta?.title.toLowerCase()} requests within {radiusKm} km. Pull to refresh.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ReportRow
              report={item}
              colors={colors}
              styles={styles}
              onPress={() => navigation.navigate('RequestDetails', { reportId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

function ReportRow({
  report,
  colors,
  styles,
  onPress,
}: {
  report: ReportWithDistance;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  const tone = getUrgencyTone(report.expiryAt);
  const toneStyle = TONES[tone];

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button">
      {report.photos[0] ? (
        <Image source={{ uri: report.photos[0] }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {report.title}
        </Text>
        <Text style={styles.rowDescription} numberOfLines={2}>
          {report.description}
        </Text>
        <View style={styles.rowMeta}>
          <MapPin size={ICON_SIZE.xs} color={colors.textSecondary} />
          <Text style={styles.rowMetaText}>{report.distanceKm} km away</Text>
          <View style={[styles.toneBadge, { backgroundColor: toneStyle.fill, borderColor: toneStyle.border }]}>
            <Clock size={10} color={toneStyle.fg} />
            <Text style={[styles.toneBadgeText, { color: toneStyle.fg }]}>
              {formatTimeRemaining(report.expiryAt)}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: SIZES.padding, marginBottom: SPACING.sm },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginTop: SPACING.xs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginTop: 2 },
    loading: { marginTop: SPACING.xxl },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    row: {
      flexDirection: 'row',
      gap: SPACING.sm,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: SPACING.sm,
    },
    photo: { width: 64, height: 64, borderRadius: RADIUS.md },
    photoPlaceholder: { backgroundColor: colors.border },
    rowBody: { flex: 1 },
    rowTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    rowDescription: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs, marginTop: SPACING.xs },
    rowMetaText: { ...TYPE.caption, color: colors.textSecondary, marginRight: SPACING.xs },
    toneBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderWidth: 1,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.xxs,
      paddingVertical: 2,
      marginLeft: 'auto',
    },
    toneBadgeText: { ...TYPE.caption, fontWeight: '700' },
    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs, paddingHorizontal: SPACING.xl },
    emptyTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
