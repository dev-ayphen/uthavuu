import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, MoreVertical, Pencil, Trash2, XCircle } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { cancelReport, deleteReport, getReport } from '@uthavu/libs-mobile/api/reports';
import { getRoster } from '@uthavu/libs-mobile/api/missions';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import RosterSection from './RosterSection';
import ImpactStorySection from './ImpactStorySection';
import MissionChat from './MissionChat';
import CommunityComments from './CommunityComments';
import RequestDetailsSkeleton from './RequestDetailsSkeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetails'>;

export default function RequestDetailsScreen({ route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('requestDetails');
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();

  const [menuOpen, setMenuOpen] = useState(false);

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportIsError,
    isFetching: reportFetching,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => getReport(reportId),
  });
  const {
    data: roster,
    isLoading: rosterLoading,
    isError: rosterIsError,
    isFetching: rosterFetching,
    refetch: refetchRoster,
  } = useQuery({
    queryKey: ['roster', reportId],
    queryFn: () => getRoster(reportId),
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['roster', reportId] });
    }, [queryClient, reportId])
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchReport(), refetchRoster()]);
    setRefreshing(false);
  };

  if (reportLoading || rosterLoading) {
    return <RequestDetailsSkeleton />;
  }
  if ((reportIsError || rosterIsError) && (!report || !roster)) {
    return (
      <ErrorState
        onRetry={() => {
          refetchReport();
          refetchRoster();
        }}
        retrying={reportFetching || rosterFetching}
      />
    );
  }
  if (!report || !roster) {
    return <RequestDetailsSkeleton />;
  }

  const hasAccess = report.isOwner || roster.myStatus === 'joined' || roster.myStatus === 'active';
  const volunteersJoined = roster.volunteers && roster.volunteers.length > 0;

  const onEditPress = () => {
    setMenuOpen(false);
    if (volunteersJoined) {
      Alert.alert(
        'Editing Unavailable',
        'Editing is unavailable because volunteers have already joined this request.'
      );
      return;
    }
    navigation.navigate('EditReport', { reportId });
  };

  const onCancelPress = () => {
    setMenuOpen(false);
    Alert.alert(
      'Cancel Request?',
      'Volunteers will be notified that help is no longer required.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelReport(reportId);
              queryClient.invalidateQueries({ queryKey: ['report', reportId] });
              queryClient.invalidateQueries({ queryKey: ['myReports'] });
              Alert.alert('Request Cancelled', 'This request has been cancelled.');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not cancel request.');
            }
          },
        },
      ]
    );
  };

  const onDeletePress = () => {
    setMenuOpen(false);
    if (volunteersJoined) {
      Alert.alert(
        'Delete Unavailable',
        'Delete is unavailable because volunteers have already joined. Please use Cancel Request instead.'
      );
      return;
    }

    Alert.alert(
      'Delete Request?',
      'This action will remove the request from your active reports.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReport(reportId);
              queryClient.invalidateQueries({ queryKey: ['myReports'] });
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not delete report.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + SPACING.sm }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryGreen} />
      }
    >
      <View style={styles.header}>
        <BackButton />
        {report.isOwner && (
          <TouchableOpacity
            style={styles.menuTriggerBtn}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Report Options"
          >
            <MoreVertical size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
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
          <Text style={styles.locationText}>{report.landmark || t('locationSharedFallback')}</Text>
        </View>

        {report.reporter && (
          <View style={styles.reporterRow}>
            <Avatar uri={report.reporter.avatarUrl} label={report.reporter.name} size={40} />
            <Text style={styles.reporterName}>{report.reporter.name}</Text>
          </View>
        )}

        {report.status === 'completed' ? (
          <ImpactStorySection reportId={reportId} report={report} roster={roster} />
        ) : (
          <RosterSection reportId={reportId} report={report} roster={roster} />
        )}

        {hasAccess ? (
          <MissionChat reportId={reportId} locked={report.status === 'completed'} />
        ) : (
          <View style={styles.chatLocked}>
            <Text style={styles.chatLockedText}>{t('chatLockedMessage')}</Text>
          </View>
        )}

        <CommunityComments reportId={reportId} />
      </View>

      {/* Owner Options Modal Sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuSheetTitle}>Report Management</Text>

            <TouchableOpacity style={styles.menuOptionRow} onPress={onEditPress}>
              <Pencil size={18} color={colors.textPrimary} />
              <View style={styles.menuOptionTextWrap}>
                <Text style={styles.menuOptionTitle}>Edit Report</Text>
                <Text style={styles.menuOptionSub}>Modify title, description, or volunteer count</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuOptionRow} onPress={onCancelPress}>
              <XCircle size={18} color={COLORS.warning} />
              <View style={styles.menuOptionTextWrap}>
                <Text style={[styles.menuOptionTitle, { color: COLORS.warning }]}>Cancel Report</Text>
                <Text style={styles.menuOptionSub}>Help is no longer required</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuOptionRow} onPress={onDeletePress}>
              <Trash2 size={18} color={colors.danger} />
              <View style={styles.menuOptionTextWrap}>
                <Text style={[styles.menuOptionTitle, { color: colors.danger }]}>Delete Report</Text>
                <Text style={styles.menuOptionSub}>Remove this request completely</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
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
      marginBottom: SPACING.xs,
    },
    menuTriggerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
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

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.6)',
      justifyContent: 'flex-end',
    },
    menuSheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      padding: SPACING.lg,
      paddingBottom: SPACING.xxxl,
    },
    menuSheetTitle: { ...TYPE.captionStrong, color: colors.textSecondary, marginBottom: SPACING.md },
    menuOptionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
    menuOptionTextWrap: { flex: 1 },
    menuOptionTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    menuOptionSub: { ...TYPE.caption, color: colors.textSecondary, marginTop: 1 },
    menuDivider: { height: 1, backgroundColor: colors.border, marginVertical: SPACING.xxs },
  });
