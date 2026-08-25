import { useCallback, useMemo, useState } from 'react';
import { Alert, Dimensions, Image, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, MapPin, MoreVertical, Pencil, Share2, Trash2, Video, XCircle } from 'lucide-react-native';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

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

  const onEditPress = () => {
    setMenuOpen(false);
    if (!report.editable) {
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
    if (!report.editable) {
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

  const onShare = async () => {
    if (!report) return;
    const link = `uthavu://requests/${reportId}`;
    try {
      await Share.share({
        message: `Check out this Impact Story on Uthavu: "${report.title}" ${link}`,
        url: link,
      });
    } catch {
      // Dismissed share sheet
    }
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
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.menuTriggerBtn}
            onPress={onShare}
            accessibilityLabel="Share Story"
          >
            <Share2 size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          {/* Edit/Cancel/Delete all require the report to still be open
              server-side (requireOwnedOpenReport) — closed/expired/completed
              reports have zero available actions here, not just completed
              ones, so the trigger itself must not be offered for any of them. */}
          {report.isOwner && report.status === 'open' && (
            <TouchableOpacity
              style={styles.menuTriggerBtn}
              onPress={() => setMenuOpen(true)}
              accessibilityLabel="Report Options"
            >
              <MoreVertical size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Media Carousel (Swipe Photos 1/N + Video overlay) ── */}
      {report.photos && report.photos.length > 0 && (
        <View style={styles.carouselContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const slide = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
              setActivePhotoIndex(slide);
            }}
            scrollEventThrottle={16}
          >
            {report.photos.map((photoUri, index) => (
              <View key={index} style={styles.carouselSlide}>
                <Image source={{ uri: photoUri }} style={styles.photo} />
                {index === report.photos.length - 1 && (
                  <TouchableOpacity
                    style={styles.videoOverlayBadge}
                    activeOpacity={0.85}
                    onPress={() => Alert.alert('Video Preview', 'Playing attached video clip...')}
                  >
                    <View style={styles.videoPlayCircle}>
                      <Video size={20} color="#FFFFFF" fill="#FFFFFF" />
                    </View>
                    <Text style={styles.videoBadgeText}>Play Video Clip</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Photo Count Badge 1/N */}
          <View style={styles.photoBadge}>
            <Camera size={12} color="#FFFFFF" />
            <Text style={styles.photoBadgeText}>
              {activePhotoIndex + 1}/{report.photos.length}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryLabel}>
            {report.category.emoji} {report.category.label}
          </Text>
        </View>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.description}>{report.description}</Text>

        <View style={styles.metaRow}>
          <View style={styles.locationGroup}>
            <MapPin size={14} color={colors.textSecondary} />
            <Text style={styles.locationText} numberOfLines={1}>{report.landmark || t('locationSharedFallback')}</Text>
          </View>
          {report.reporter && (
            <View style={styles.reporterGroup}>
              <Avatar uri={report.reporter.avatarUrl} label={report.reporter.name} size={28} />
              <Text style={styles.reporterName}>{report.reporter.name}</Text>
            </View>
          )}
          {report.reporterDeleted && (
            <View style={styles.reporterGroup}>
              <Avatar uri={null} label={t('deletedUserLabel')} size={28} />
              <Text style={styles.reporterName}>{t('deletedUserLabel')}</Text>
            </View>
          )}
        </View>

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

            <TouchableOpacity style={styles.menuOptionRow} onPress={onEditPress} activeOpacity={report.editable ? 0.6 : 1}>
              <Pencil size={18} color={report.editable ? colors.textPrimary : colors.textSecondary} />
              <View style={styles.menuOptionTextWrap}>
                <Text style={[styles.menuOptionTitle, !report.editable && styles.menuOptionTitleDisabled]}>
                  Edit Report
                </Text>
                <Text style={styles.menuOptionSub}>
                  {report.editable
                    ? 'Modify title, description, or volunteer count'
                    : 'Unavailable — a volunteer has already joined'}
                </Text>
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

            <TouchableOpacity style={styles.menuOptionRow} onPress={onDeletePress} activeOpacity={report.editable ? 0.6 : 1}>
              <Trash2 size={18} color={report.editable ? colors.danger : colors.textSecondary} />
              <View style={styles.menuOptionTextWrap}>
                <Text
                  style={[
                    styles.menuOptionTitle,
                    report.editable ? { color: colors.danger } : styles.menuOptionTitleDisabled,
                  ]}
                >
                  Delete Report
                </Text>
                <Text style={styles.menuOptionSub}>
                  {report.editable
                    ? 'Remove this request completely'
                    : 'Unavailable — use Cancel Request instead'}
                </Text>
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
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
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
    carouselContainer: {
      width: '100%',
      height: 220,
      position: 'relative',
    },
    carouselSlide: {
      width: SCREEN_WIDTH,
      height: 220,
      position: 'relative',
    },
    photo: { width: '100%', height: 220 },
    photoBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: 'rgba(15,23,42,0.75)',
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    photoBadgeText: { ...TYPE.microLabel, color: '#FFFFFF', fontWeight: '700' },
    videoOverlayBadge: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      backgroundColor: 'rgba(15,23,42,0.85)',
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    videoPlayCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: COLORS.secondaryBlue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoBadgeText: { ...TYPE.captionStrong, color: '#FFFFFF' },
    content: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.lg },
    categoryBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 6,
    },
    categoryLabel: { ...TYPE.captionStrong, color: colors.textSecondary },
    title: { ...TYPE.title, fontSize: 18, lineHeight: 24, color: colors.textPrimary, marginBottom: 4 },
    description: { ...TYPE.body, color: colors.textSecondary, marginBottom: 10, lineHeight: 18 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    locationGroup: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: SPACING.sm },
    locationText: { ...TYPE.caption, color: colors.textSecondary, flexShrink: 1 },
    reporterGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reporterName: { ...TYPE.captionStrong, color: colors.textPrimary },
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
    menuOptionTitleDisabled: { color: colors.textSecondary },
    menuOptionSub: { ...TYPE.caption, color: colors.textSecondary, marginTop: 1 },
    menuDivider: { height: 1, backgroundColor: colors.border, marginVertical: SPACING.xxs },
  });
