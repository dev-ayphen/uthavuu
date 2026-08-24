import { useMemo } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Bookmark } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { listSavedReports, type Report } from '@uthavu/libs-mobile/api/reports';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';
import BackButton from '@uthavu/libs-mobile/components/BackButton';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedStories'>;

// Profile → Saved Stories. Reads the same bookmark state
// ImpactStorySection's Save button writes — see libs-mobile/api/reports.ts's
// saveReport()/unsaveReport()/listSavedReports().
export default function SavedStoriesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    data: reports,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({ queryKey: ['savedReports'], queryFn: listSavedReports });

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.xs }]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>{t('savedStoriesTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton width={54} height={54} borderRadius={RADIUS.sm} />
              <View style={styles.cardBody}>
                <Skeleton width="60%" height={12} />
                <Skeleton width="90%" height={14} style={styles.skeletonLine} />
              </View>
            </View>
          ))}
        </View>
      ) : isError && !reports ? (
        <ErrorState onRetry={refetch} retrying={isFetching} />
      ) : (
        <FlatList
          data={reports ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isFetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Bookmark size={40} color={colors.textSecondary} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>{t('savedStoriesEmptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('savedStoriesEmptySubtitle')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <SavedStoryCard
              report={item}
              colors={colors}
              styles={styles}
              t={t}
              onPress={() => navigation.navigate('RequestDetails', { reportId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

function SavedStoryCard({
  report,
  colors,
  styles,
  t,
  onPress,
}: {
  report: Report;
  colors: ColorScheme;
  styles: ReturnType<typeof createStyles>;
  t: (key: string, options?: Record<string, unknown>) => string;
  onPress: () => void;
}) {
  const photo = report.photos[0];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={report.title}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.cardPhoto} />
      ) : (
        <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardMetaText}>
          {report.category.emoji} {report.category.label}
        </Text>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {report.title}
        </Text>
        <View style={styles.cardLinkRow}>
          <Text style={styles.cardLinkText}>{t('saved')}</Text>
          <ArrowRight size={ICON_SIZE.xs} color={colors.primaryGreen} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SIZES.padding,
      paddingBottom: SPACING.sm,
    },
    title: { ...TYPE.screenTitle, color: colors.textPrimary },
    headerSpacer: { width: SPACING.xl },
    list: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    skeletonLine: { marginTop: SPACING.xs },
    card: {
      flexDirection: 'row',
      gap: SPACING.xs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.xs,
    },
    cardPhoto: { width: 54, height: 54, borderRadius: RADIUS.sm },
    cardPhotoPlaceholder: { backgroundColor: colors.border },
    cardBody: { flex: 1, justifyContent: 'center' },
    cardMetaText: { ...TYPE.caption, color: colors.textSecondary },
    cardTitle: { ...TYPE.bodyStrong, color: colors.textPrimary, marginTop: SPACING.xxs / 2 },
    cardLinkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs / 2, marginTop: SPACING.xxs },
    cardLinkText: { ...TYPE.microLabel, color: colors.primaryGreen, fontWeight: '700' },
    empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.xs, paddingHorizontal: SPACING.xl },
    emptyTitle: { ...TYPE.title, color: colors.textPrimary, marginTop: SPACING.xs },
    emptySubtitle: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
