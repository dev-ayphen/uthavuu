import { useCallback, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '../../theme/tokens';
import { getReport } from '../../api/reports';
import { getRoster } from '../../api/missions';
import Avatar from '../../components/Avatar';
import BackButton from '../../components/BackButton';
import RosterSection from './RosterSection';
import MissionChat from './MissionChat';
import RequestDetailsSkeleton from './RequestDetailsSkeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetails'>;

export default function RequestDetailsScreen({ route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const queryClient = useQueryClient();

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => getReport(reportId),
  });
  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ['roster', reportId],
    queryFn: () => getRoster(reportId),
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['roster', reportId] });
    }, [queryClient, reportId])
  );

  if (reportLoading || rosterLoading || !report || !roster) {
    return <RequestDetailsSkeleton />;
  }

  const hasAccess = report.isOwner || roster.myStatus === 'joined' || roster.myStatus === 'active';

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + SPACING.sm }}>
      <View style={styles.header}>
        <BackButton />
      </View>

      {report.photos[0] && <Image source={{ uri: report.photos[0] }} style={styles.photo} />}

      <View style={styles.content}>
        <Text style={styles.categoryLabel}>
          {report.category.emoji} {report.category.label}
        </Text>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.description}>{report.description}</Text>

        <View style={styles.locationRow}>
          <MapPin size={ICON_SIZE.sm} color={colors.textSecondary} />
          <Text style={styles.locationText}>{report.landmark || 'Location shared'}</Text>
        </View>

        {report.reporter && (
          <View style={styles.reporterRow}>
            <Avatar uri={report.reporter.avatarUrl} label={report.reporter.name} size={40} />
            <Text style={styles.reporterName}>{report.reporter.name}</Text>
          </View>
        )}

        <RosterSection reportId={reportId} report={report} roster={roster} />

        {hasAccess ? (
          <MissionChat reportId={reportId} />
        ) : (
          <View style={styles.chatLocked}>
            <Text style={styles.chatLockedText}>
              🔒 Mission Chat is available after you accept this request.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: SIZES.padding, marginBottom: SPACING.xs },
    photo: { width: '100%', height: 220 },
    content: { padding: SIZES.padding },
    categoryLabel: { ...TYPE.captionStrong, color: colors.textSecondary, marginBottom: SPACING.xxs },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xs },
    description: { ...TYPE.body, color: colors.textSecondary, marginBottom: SPACING.sm, lineHeight: 19 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs, marginBottom: SPACING.md },
    locationText: { ...TYPE.body, color: colors.textSecondary },
    reporterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.lg },
    reporterName: { ...TYPE.bodyStrong, color: colors.textPrimary },
    chatLocked: {
      marginTop: SPACING.lg,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chatLockedText: { ...TYPE.subhead, color: colors.textSecondary, textAlign: 'center' },
  });
