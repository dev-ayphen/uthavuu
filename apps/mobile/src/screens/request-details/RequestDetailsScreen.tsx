import { useCallback, useMemo, useState } from 'react';
import { Alert, Dimensions, Image, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, FileX, MapPin, MoreVertical, Pencil, Share2, Trash2, XCircle } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { COLORS, ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { cancelReport, deleteReport, getReport } from '@uthavu/libs-mobile/api/reports';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import { getRoster } from '@uthavu/libs-mobile/api/missions';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import { Divider } from '@uthavu/libs-mobile/components';
import RosterSection from './RosterSection';
import HeldForReviewCard from './HeldForReviewCard';
import ImpactStorySection from './ImpactStorySection';
import MissionChat from './MissionChat';
import CommunityComments from './CommunityComments';
import RequestDetailsSkeleton from './RequestDetailsSkeleton';
import ErrorState from '@uthavu/libs-mobile/components/ErrorState';
import { useConfig } from '../../hooks/useConfig';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetails'>;

export default function RequestDetailsScreen({ route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reportId } = route.params;
  const config = useConfig();
  const queryClient = useQueryClient();
  const navigation = useNavigation<any>();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportIsError,
    error: reportError,
    isFetching: reportFetching,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => getReport(reportId),
  });
  /**
   * A held report has no mission, and the API is emphatic about it.
   *
   * `pending_review` is a PRE-PUBLICATION status (report-visibility.ts), so
   * `GET /reports/:id/volunteers`, `/comments` and `/messages` all answer
   * `404 REPORT_REMOVED` — including for the reporter who filed it, even though
   * `GET /reports/:id` itself returns 200 for that same person. Verified against
   * a live held report on 2026-09-05.
   *
   * This screen used to treat the roster as a PRECONDITION for rendering
   * anything, so that 404 took the owner's own screen down to a generic "You
   * appear to be offline" with a Retry button that could only fail again — for a
   * report the API had just served them. Not requesting it is both the fix and
   * the honest product behaviour: no volunteer can see a held report, so there is
   * nobody to list, nobody to chat to and no public comment thread. The roster
   * is a section, not a gate.
   */
  const heldForReview = report?.status === 'pending_review';

  const {
    data: roster,
    isLoading: rosterLoading,
    isError: rosterIsError,
    isFetching: rosterFetching,
    refetch: refetchRoster,
  } = useQuery({
    queryKey: ['roster', reportId],
    queryFn: () => getRoster(reportId),
    // Deliberately not fired at all rather than fired and forgiven: a request
    // whose only possible answer is 404 is not a request worth making, and a
    // tolerated 404 is one somebody later "fixes" by removing the tolerance.
    enabled: report !== undefined && !heldForReview,
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
  // A REMOVED report is not a failed request, and must not be dressed as one.
  //
  // The API goes to real trouble to distinguish REPORT_REMOVED from
  // REPORT_NOT_FOUND (report-visibility.ts) precisely so a volunteer mid-mission
  // can be told what happened. This screen discarded that and rendered the
  // generic network state: a WiFi-off icon reading "Check your connection and
  // try again", over a Retry button that could only ever fail again — for a
  // report an admin had removed.
  //
  // Deliberately NOT "removed by a moderator": the same 404 covers a reporter
  // deleting their own request and an account deletion cascading. The server's
  // own wording is the honest superset, so it is what gets shown.
  const removed =
    reportError instanceof ApiError && reportError.code === 'REPORT_REMOVED';
  if (removed) {
    return <ErrorState icon={FileX} message={reportError.message} />;
  }

  if ((reportIsError || rosterIsError) && (!report || (!roster && !heldForReview))) {
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
  if (!report || (!roster && !heldForReview)) {
    return <RequestDetailsSkeleton />;
  }

  const hasAccess = report.isOwner || roster?.myStatus === 'joined' || roster?.myStatus === 'active';

  const onEditPress = () => {
    setMenuOpen(false);
    if (!report.editable) {
      Alert.alert(t('ownerEditLockedTitle'), t('ownerEditLockedMessage'));
      return;
    }
    navigation.navigate('EditReport', { reportId });
  };

  const onCancelPress = () => {
    setMenuOpen(false);
    Alert.alert(
      t('ownerCancelTitle'),
      t('ownerCancelMessage'),
      [
        { text: t('ownerCancelKeep'), style: 'cancel' },
        {
          text: t('ownerCancelConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelReport(reportId);
              queryClient.invalidateQueries({ queryKey: ['report', reportId] });
              queryClient.invalidateQueries({ queryKey: ['myReports'] });
              Alert.alert(t('ownerCancelledTitle'), t('ownerCancelledMessage'));
            } catch (e: any) {
              Alert.alert(t('common:errorTitle'), e?.message || t('ownerCancelFailed'));
            }
          },
        },
      ]
    );
  };

  const onDeletePress = () => {
    setMenuOpen(false);
    if (!report.editable) {
      Alert.alert(t('ownerDeleteLockedTitle'), t('ownerDeleteLockedMessage'));
      return;
    }

    Alert.alert(
      t('ownerDeleteTitle'),
      t('ownerDeleteMessage'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('ownerDeleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReport(reportId);
              queryClient.invalidateQueries({ queryKey: ['myReports'] });
              navigation.goBack();
            } catch (e: any) {
              Alert.alert(t('common:errorTitle'), e?.message || t('ownerDeleteFailed'));
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
            accessibilityLabel={t('shareStoryLabel')}
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
              accessibilityLabel={t('reportOptionsLabel')}
            >
              <MoreVertical size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Media Carousel (Swipe Photos 1/N) ── */}
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

        {/* A held report, seen by the person waiting on it.
            Placed ABOVE the roster on purpose: the roster of a `pending_review`
            report is necessarily empty — volunteers cannot see it at all — so
            without this the reporter's own screen reads as "nobody has come to
            help yet" when the truth is that nobody has been asked. Owner-only:
            this is the reporter's business, and nobody else can reach a held
            report anyway (report-visibility.ts filters it out of discovery). */}
        {report.isOwner && report.status === 'pending_review' && (
          <HeldForReviewCard report={report} />
        )}

        {roster &&
          (report.status === 'completed' ? (
            <ImpactStorySection reportId={reportId} report={report} roster={roster} />
          ) : (
            <RosterSection reportId={reportId} report={report} roster={roster} />
          ))}

        {/* Both branches are wrong for a held report: there is no volunteer to
            talk to, so "Mission Chat" would be an empty room, and the locked
            variant ("accept this request to chat") is addressed to somebody who
            cannot even see it. */}
        {!heldForReview &&
          (hasAccess ? (
            <MissionChat reportId={reportId} locked={report.status === 'completed'} />
          ) : (
            <View style={styles.chatLocked}>
              <Text style={styles.chatLockedText}>{t('chatLockedMessage')}</Text>
            </View>
          ))}

        {/* Community Comments are a platform-level switch (GET /config).
            Off means the section isn't rendered at all — Mission Chat above is
            a separate, privately-gated channel and is unaffected. */}
        {config.commentsEnabled && !heldForReview && <CommunityComments reportId={reportId} />}
      </View>

      {/* Owner Options Modal Sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuSheetTitle}>{t('ownerMenuTitle')}</Text>

            <TouchableOpacity style={styles.menuOptionRow} onPress={onEditPress} activeOpacity={report.editable ? 0.6 : 1}>
              <Pencil size={18} color={report.editable ? colors.textPrimary : colors.textSecondary} />
              <View style={styles.menuOptionTextWrap}>
                <Text style={[styles.menuOptionTitle, !report.editable && styles.menuOptionTitleDisabled]}>
                  {t('ownerMenuEdit')}
                </Text>
                <Text style={styles.menuOptionSub}>
                  {report.editable
                    ? t('ownerMenuEditSub')
                    : t('ownerMenuEditSubLocked')}
                </Text>
              </View>
            </TouchableOpacity>

            <Divider spacing={SPACING.xxs} />

            <TouchableOpacity style={styles.menuOptionRow} onPress={onCancelPress}>
              <XCircle size={18} color={COLORS.warning} />
              <View style={styles.menuOptionTextWrap}>
                <Text style={[styles.menuOptionTitle, { color: COLORS.warning }]}>{t('ownerMenuCancel')}</Text>
                <Text style={styles.menuOptionSub}>{t('ownerMenuCancelSub')}</Text>
              </View>
            </TouchableOpacity>

            <Divider spacing={SPACING.xxs} />

            <TouchableOpacity style={styles.menuOptionRow} onPress={onDeletePress} activeOpacity={report.editable ? 0.6 : 1}>
              <Trash2 size={18} color={report.editable ? colors.danger : colors.textSecondary} />
              <View style={styles.menuOptionTextWrap}>
                <Text
                  style={[
                    styles.menuOptionTitle,
                    report.editable ? { color: colors.danger } : styles.menuOptionTitleDisabled,
                  ]}
                >
                  {t('ownerMenuDelete')}
                </Text>
                <Text style={styles.menuOptionSub}>
                  {report.editable
                    ? t('ownerMenuDeleteSub')
                    : t('ownerMenuDeleteSubLocked')}
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
  });
