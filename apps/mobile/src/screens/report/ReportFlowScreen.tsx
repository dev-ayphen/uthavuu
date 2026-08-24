import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ChevronRight, CheckCircle2 } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { CATEGORIES, type CategoryId } from '@uthavu/libs-mobile/data/categories';
import { listReportCategories, createReport } from '@uthavu/libs-mobile/api/reports';
import { uploadImage } from '@uthavu/libs-mobile/api/users';
import { reverseGeocode } from '@uthavu/libs-mobile/lib/geocode';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Button from '@uthavu/libs-mobile/components/Button';
import { DESCRIPTION_MIN_LENGTH, EMPTY_DRAFT, type ReportDraft } from './reportDraft';
import ReportDetailsPage from './steps/ReportDetailsPage';
import ReportLocationPage from './steps/ReportLocationPage';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportFlow'>;

// Page 0 = Category selection (inline, no separate screen)
// Page 1 = Details (photo, description, title, volunteers)
// Page 2 = Location & Privacy → Publish
const PAGES = ['category', 'details', 'location'] as const;

// Accent palettes for category tiles
const CAT_ACCENT: Record<CategoryId, { iconBg: string }> = {
  animalRescue:   { iconBg: '#FEF3C7' },
  medicalHelp:    { iconBg: '#FFE4E6' },
  foodDonation:   { iconBg: '#DCFCE7' },
  roadsideHelp:   { iconBg: '#DBEAFE' },
  elderlySupport: { iconBg: '#EDE9FE' },
  bloodDonation:  { iconBg: '#FEE2E2' },
  communityHelp:  { iconBg: '#D1FAE5' },
  lostAndFound:   { iconBg: '#FEF9C3' },
};

const CAT_TAGLINE: Record<CategoryId, string> = {
  animalRescue:   'Injured, stray or trapped animals',
  medicalHelp:    'Emergency medical assistance',
  foodDonation:   'Meals, groceries & supplies',
  roadsideHelp:   'Vehicle breakdowns & accidents',
  elderlySupport: 'Care & support for senior citizens',
  bloodDonation:  'Urgent blood donor needed',
  communityHelp:  'Neighbourhood & public help',
  lostAndFound:   'Missing people or belongings',
};

export default function ReportFlowScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('report');
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(route.params?.categoryKey ? 1 : 0);
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(
    route.params?.categoryKey ?? null,
  );
  const [draft, setDraft] = useState<ReportDraft>({ ...EMPTY_DRAFT });
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Success modal
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['reportCategories'],
    queryFn: listReportCategories,
  });
  const category = categories?.find((c) => c.key === selectedCategory);

  // Fetch GPS on mount
  useEffect(() => {
    fetchLocation();
  }, []);

  const fetchLocation = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError(
          'Location access is required to publish a request. Enable it in your device settings and try again.'
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const { latitude: lat, longitude: lng } = pos.coords;
      const { city, district } = await reverseGeocode(lat, lng);
      setDraft((d) => ({
        ...d, lat, lng,
        locationLabel: city ? `${city}, ${district}` : district,
      }));
    } catch {
      setLocationError('Could not detect your location. Check your GPS/network and try again.');
    } finally {
      setLocating(false);
    }
  };

  // Camera-only photo capture
  const onTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(t('flow.cameraNeededTitle'), t('flow.cameraNeededMessage'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    const localUri = result.assets[0].uri;
    setDraft((d) => ({
      ...d,
      photos: [...d.photos, { localUri, uploadedUrl: null, uploading: true, error: '' }],
    }));
    try {
      const uploaded = await uploadImage(localUri);
      setDraft((d) => ({
        ...d,
        photos: d.photos.map((p) =>
          p.localUri === localUri ? { ...p, uploadedUrl: uploaded.url, uploading: false } : p,
        ),
      }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('flow.uploadFailed');
      setDraft((d) => ({
        ...d,
        photos: d.photos.map((p) =>
          p.localUri === localUri ? { ...p, uploading: false, error: msg } : p,
        ),
      }));
    }
  };

  const onRemovePhoto = (index: number) => {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== index) }));
  };

  const canProceedDetails =
    draft.photos.length > 0 &&
    draft.photos.every((p) => p.uploadedUrl && !p.uploading) &&
    draft.title.trim().length > 0 &&
    draft.description.trim().length >= DESCRIPTION_MIN_LENGTH;

  const onBack = () => {
    if (page === 0) { navigation.goBack(); return; }
    setPage((p) => p - 1);
  };

  const onNext = () => setPage((p) => p + 1);

  const canPublish = confirmed && !locating && draft.lat !== null && draft.lng !== null;

  const onPublishInternal = async () => {
    if (!selectedCategory || draft.lat === null || draft.lng === null || publishing) return;
    setPublishing(true);
    setError('');
    try {
      const created = await createReport({
        categoryKey: selectedCategory,
        title: draft.title.trim(),
        description: draft.description.trim(),
        lat: draft.lat,
        lng: draft.lng,
        landmark: draft.landmark.trim() || undefined,
        anonymous: draft.anonymous,
        phoneVisible: draft.phoneVisible,
        neededVolunteers: draft.neededVolunteers,
        photoUrls: draft.photos
          .map((p) => p.uploadedUrl)
          .filter((url): url is string => Boolean(url)),
      });
      queryClient.invalidateQueries({ queryKey: ['myReports'] });
      setCreatedReportId(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('flow.publishError'));
    } finally {
      setPublishing(false);
    }
  };

  const pageTitles = ['Select Category', 'Add Details', 'Location & Privacy'];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Nav header ── */}
      <View style={[styles.navBar, { paddingTop: insets.top + SPACING.xs }]}>
        <BackButton onPress={onBack} />
        <Text style={styles.navTitle}>{pageTitles[page]}</Text>
        <View style={styles.navSpacer} />
      </View>

      {/* ── Progress bar ── */}
      <View style={styles.progressRow}>
        {PAGES.map((_, i) => (
          <View
            key={i}
            style={[styles.progressSeg, i <= page && styles.progressSegActive]}
          />
        ))}
      </View>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── PAGE 0: Category Selection ── */}
        {page === 0 && (
          <View>
            <Text style={styles.pageTitle}>What kind of help{'\n'}is needed?</Text>
            <Text style={styles.pageSubtitle}>Select the closest category to continue.</Text>

            <View style={styles.catList}>
              {CATEGORIES.map((cat, idx) => {
                const acc = CAT_ACCENT[cat.id as CategoryId];
                const isLast = idx === CATEGORIES.length - 1;
                return (
                  <Pressable
                    key={cat.id}
                    style={({ pressed }) => [
                      styles.catRow,
                      !isLast && styles.catRowBorder,
                      pressed && styles.catRowPressed,
                    ]}
                    onPress={() => {
                      setSelectedCategory(cat.id as CategoryId);
                      onNext();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={cat.title}
                  >
                    <View style={[styles.catIconBubble, { backgroundColor: acc.iconBg }]}>
                      <Text style={styles.catEmoji}>{cat.emoji}</Text>
                    </View>
                    <View style={styles.catText}>
                      <Text style={styles.catTitle}>{cat.title}</Text>
                      <Text style={styles.catSub} numberOfLines={1}>
                        {CAT_TAGLINE[cat.id as CategoryId]}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── PAGE 1: Details ── */}
        {page === 1 && selectedCategory && (
          <ReportDetailsPage
            draft={draft}
            categoryKey={selectedCategory}
            onChangeTitle={(title) => setDraft((d) => ({ ...d, title }))}
            onChangeDescription={(description) => setDraft((d) => ({ ...d, description }))}
            onChangeNeededVolunteers={(neededVolunteers) =>
              setDraft((d) => ({ ...d, neededVolunteers }))
            }
            onTakePhoto={onTakePhoto}
            onRemovePhoto={onRemovePhoto}
          />
        )}

        {/* ── PAGE 2: Location & Privacy ── */}
        {page === 2 && (
          <ReportLocationPage
            locating={locating}
            locationLabel={draft.locationLabel}
            landmark={draft.landmark}
            anonymous={draft.anonymous}
            phoneVisible={draft.phoneVisible}
            shareWithNGOs={false}
            confirmed={confirmed}
            category={category}
            onChangeLandmark={(landmark) => setDraft((d) => ({ ...d, landmark }))}
            onToggleAnonymous={(anonymous) => setDraft((d) => ({ ...d, anonymous }))}
            onTogglePhoneVisible={(phoneVisible) => setDraft((d) => ({ ...d, phoneVisible }))}
            onToggleConfirmed={(val) => setConfirmed(val)}
          />
        )}

        {page === 2 && locationError ? (
          <View style={styles.locationErrorBox}>
            <Text style={styles.locationErrorText}>{locationError}</Text>
            <TouchableOpacity onPress={fetchLocation}>
              <Text style={styles.locationRetryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {/* ── Footer button (pages 1 & 2 only; page 0 uses row taps) ── */}
      {page === 1 && (
        <View style={styles.footer}>
          <Button
            label="Next: Location & Privacy →"
            onPress={onNext}
            disabled={!canProceedDetails}
          />
        </View>
      )}
      {page === 2 && (
        <View style={styles.footer}>
          <Button
            label={t('flow.publish')}
            onPress={onPublishInternal}
            loading={publishing}
            disabled={!canPublish}
          />
        </View>
      )}

      {/* ── Success modal ── */}
      <Modal visible={Boolean(createdReportId)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <CheckCircle2 size={36} color={colors.primaryGreen} />
            </View>
            <Text style={styles.successTitle}>Request Posted ✅</Text>
            <Text style={styles.successSub}>
              Your request is now live for nearby volunteers and community members.
            </Text>
            <View style={styles.successBtnStack}>
              <Button
                label="View Request"
                onPress={() => {
                  const id = createdReportId;
                  setCreatedReportId(null);
                  if (id) navigation.replace('RequestDetails', { reportId: id });
                }}
              />
              <TouchableOpacity
                style={styles.homeBtn}
                onPress={() => { setCreatedReportId(null); navigation.navigate('MainTabs'); }}
              >
                <Text style={styles.homeBtnText}>Go to Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },

    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: SPACING.xs,
    },
    navTitle: { ...TYPE.screenTitle, color: colors.textPrimary, flex: 1, textAlign: 'center' },
    navSpacer: { width: 44 },

    progressRow: {
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 16,
      marginBottom: SPACING.sm,
    },
    progressSeg: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    progressSegActive: { backgroundColor: colors.primaryGreen },

    scrollContent: { paddingHorizontal: 16, paddingBottom: SPACING.xl },
    error: { ...TYPE.body, color: colors.danger, marginTop: SPACING.sm, textAlign: 'center' },
    locationErrorBox: {
      marginTop: SPACING.sm,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.danger,
      gap: SPACING.xs,
    },
    locationErrorText: { ...TYPE.body, color: colors.danger },
    locationRetryText: { ...TYPE.footnote, color: colors.primaryGreen, fontWeight: '700' },

    footer: {
      paddingHorizontal: 16,
      paddingVertical: SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
      paddingBottom: Math.max(insets.bottom, SPACING.xs),
    },

    // ── Page 0: Category ──
    pageTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      lineHeight: 30,
      marginBottom: 6,
      marginTop: SPACING.xs,
    },
    pageSubtitle: {
      ...TYPE.body,
      color: colors.textSecondary,
      marginBottom: SPACING.lg,
      lineHeight: 20,
    },

    catList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      gap: SPACING.sm,
      backgroundColor: colors.bgElevated,
    },
    catRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    catRowPressed: { backgroundColor: colors.bg },
    catIconBubble: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catEmoji: { fontSize: 22 },
    catText: { flex: 1 },
    catTitle: { ...TYPE.bodyStrong, fontSize: 15, color: colors.textPrimary, fontWeight: '700', marginBottom: 2 },
    catSub: { ...TYPE.caption, color: colors.textSecondary, lineHeight: 16 },

    // ── Success modal ──
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.65)',
      justifyContent: 'center',
      padding: SPACING.lg,
    },
    successCard: {
      backgroundColor: colors.bg,
      borderRadius: RADIUS.xxl,
      padding: SPACING.xl,
      alignItems: 'center',
    },
    successIconBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primaryGreenLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.sm,
    },
    successTitle: { ...TYPE.title, fontSize: 20, color: colors.textPrimary, fontWeight: '800' },
    successSub: { ...TYPE.body, color: colors.textSecondary, textAlign: 'center', marginTop: SPACING.xxs, marginBottom: SPACING.lg, lineHeight: 19 },
    successBtnStack: { width: '100%', gap: SPACING.xs },
    homeBtn: {
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    homeBtnText: { ...TYPE.subheadStrong, color: colors.textPrimary },
  });
