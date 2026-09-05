import { useEffect, useMemo, useRef, useState } from 'react';
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
import { CheckCircle2, Clock } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TONES, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { type CategoryId } from '@uthavu/libs-mobile/data/categories';
import { listReportCategories, createReport, type Report } from '@uthavu/libs-mobile/api/reports';
import { getMe } from '@uthavu/libs-mobile/api/users';
import { UPLOAD_RATE_LIMITED, uploadReportPhoto } from '@uthavu/libs-mobile/api/reportPhotos';
import { reverseGeocode } from '@uthavu/libs-mobile/lib/geocode';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Button from '@uthavu/libs-mobile/components/Button';
import { useConfig } from '../../hooks/useConfig';
import {
  DESCRIPTION_MIN_LENGTH,
  EMPTY_DRAFT,
  type PhotoDraft,
  type ReportDraft,
} from './reportDraft';
import { publishErrorCopyKey } from './photoVerdictCopy';
import ReportDetailsPage from './steps/ReportDetailsPage';
import ReportLocationPage from './steps/ReportLocationPage';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportFlow'>;

// Page 0 = Details (photo, description, title, volunteers, category inline)
// Page 1 = Location & Privacy → Publish
const PAGES = ['details', 'location'] as const;

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

// CAT_TAGLINE lived here: eight English category taglines in a module-level
// map, rendered by no component in this file since the category picker moved
// onto ReportDetailsPage. Deleted rather than translated — a catalogue entry
// nothing reads is worse than no entry, because the next i18n audit counts it
// as covered.

export default function ReportFlowScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('report');
  // Platform settings (photo cap, volunteer cap, whether anonymous posting is
  // allowed at all). Always resolves — falls back to the values this flow used
  // to hardcode if /config is unreachable, so the report flow never waits on it.
  const config = useConfig();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>(
    route.params?.categoryKey ?? 'animalRescue',
  );
  const [draft, setDraft] = useState<ReportDraft>({ ...EMPTY_DRAFT });
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // The created report, not just its id — the success modal has to tell the
  // truth about whether it is live, and only `status` knows that.
  const [created, setCreated] = useState<Report | null>(null);
  // Set the instant publishing starts and never cleared on success. See
  // onPublishInternal for why this can't be `publishMutation.isPending`.
  const publishGuard = useRef(false);

  const { data: categories } = useQuery({
    queryKey: ['reportCategories'],
    queryFn: listReportCategories,
  });

  // Settings → Privacy's defaultAnonymous/defaultPhoneVisible pre-fill this
  // draft's toggles — seeded once when `me` first resolves (usually
  // instant, already cached by other screens), never overwriting a value
  // the person has since changed by hand.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const privacyDefaultsSeeded = useRef(false);
  useEffect(() => {
    if (!me || privacyDefaultsSeeded.current) return;
    privacyDefaultsSeeded.current = true;
    setDraft((d) => ({ ...d, anonymous: me.defaultAnonymous, phoneVisible: me.defaultPhoneVisible }));
  }, [me]);

  // Derived rather than folded into the draft on purpose. This seeding effect
  // runs once, and `config` may still be in flight when it does — so a saved
  // defaultAnonymous of true can land in the draft before the platform switch
  // is known to be off. Reading it as a derivation means the answer is correct
  // whenever config arrives, and the toggle being hidden (below) can never
  // leave a report silently publishing anonymously with the setting disabled.
  const anonymous = config.allowAnonymousReports && draft.anonymous;
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

  // Guards a second camera launch while the first is still opening. A ref, not
  // state: `setState` doesn't land before the second tap's handler runs, so a
  // state flag reads stale and both taps proceed — two cameras, and on the
  // append path a photo past maxPhotosPerReport.
  const capturingRef = useRef(false);
  // Per-capture identity. A counter rather than the local URI, which is not
  // guaranteed unique across captures — see PhotoDraft.key.
  const photoKeySeq = useRef(0);

  /**
   * Applies an update to one photo, by key.
   *
   * The `map` is what makes a late verification response safe: if the reporter
   * removed or retook that photo while it was in flight, no entry matches and
   * the response is dropped instead of resurrecting a deleted photo or
   * overwriting its replacement's verdict.
   */
  const updatePhoto = (key: string, patch: Partial<PhotoDraft>) => {
    setDraft((d) => ({
      ...d,
      photos: d.photos.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    }));
  };

  const uploadErrorMessage = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === UPLOAD_RATE_LIMITED) {
        // The server knows the real wait; saying "later" when it told us "42
        // seconds" invites exactly the retry loop the limit exists to stop.
        return e.retryAfterSeconds
          ? t('photoVerification.rateLimitedIn', { seconds: e.retryAfterSeconds })
          : t('photoVerification.rateLimited');
      }
      if (e.code === 'NETWORK_UNREACHABLE') return t('photoVerification.offline');
    }
    // Deliberately NOT `e.message`: the API speaks English only and this app
    // ships in two languages. Nothing actionable is lost — a photo's own
    // outcome always arrives as a 200 verdict, never as an error.
    return t('photoVerification.uploadFailed');
  };

  /** Sends one capture for a verdict and folds the answer into its draft entry. */
  const verifyPhoto = async (key: string, localUri: string) => {
    try {
      const result = await uploadReportPhoto(localUri, selectedCategory);

      // A pass/review with no id would be a contract violation, and treating it
      // as attachable would put a photo in the grid whose id can never reach
      // POST /reports — the reporter would see a verified photo and publish a
      // report without it. Treated as a failed upload, which is retakeable.
      if (result.verdict !== 'reject' && !result.uploadId) {
        updatePhoto(key, {
          uploadId: null,
          state: 'failed',
          reason: null,
          error: t('photoVerification.uploadFailed'),
        });
        return;
      }

      updatePhoto(key, {
        // Null for a reject, by contract and by belt-and-braces: this is the
        // field the publish payload is built from, so a refused photo
        // physically cannot contribute an id to it.
        uploadId: result.verdict === 'reject' ? null : result.uploadId,
        state: result.verdict,
        reason: result.reason,
        error: '',
      });
    } catch (e) {
      updatePhoto(key, {
        uploadId: null,
        state: 'failed',
        reason: null,
        error: uploadErrorMessage(e),
      });
    }
  };

  /**
   * Camera-only photo capture, then verification.
   *
   * `replaceIndex` is the retake path: it swaps the photo in place rather than
   * appending, so retaking photo 1 of 3 doesn't shuffle the other two under
   * their slot labels, and the refused capture doesn't linger in the grid
   * beside its replacement.
   */
  const capturePhoto = async (replaceIndex?: number) => {
    if (capturingRef.current) return;
    // The cap the server enforces (create-report.dto.ts photoUploadIds.max),
    // read from /config instead of being implied by the number of slots the
    // details page happened to draw. A retake consumes no new slot.
    if (replaceIndex === undefined && draft.photos.length >= config.maxPhotosPerReport) return;

    capturingRef.current = true;
    let localUri: string;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('flow.cameraNeededTitle'), t('flow.cameraNeededMessage'));
        return;
      }
      // `mediaTypes` was missing at this one call site and present at every
      // other capture site in the app. The default admits video, so a held
      // shutter produced a .mov that the uploader labelled image/jpeg and the
      // API refused as an unreadable file — a rejection the app inflicted on
      // its own user, with no way for them to understand or avoid it.
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      localUri = result.assets[0].uri;
    } finally {
      // Released once the camera closes, NOT after verification — a second
      // photo can be taken while the first is still being checked, which is how
      // this flow already behaved and what a multi-slot grid implies.
      capturingRef.current = false;
    }

    const key = `photo-${++photoKeySeq.current}`;
    const pending: PhotoDraft = {
      key,
      localUri,
      uploadId: null,
      state: 'verifying',
      reason: null,
      error: '',
    };

    setDraft((d) => {
      const photos = [...d.photos];
      if (replaceIndex === undefined) photos.push(pending);
      else photos.splice(replaceIndex, 1, pending);
      return { ...d, photos };
    });

    void verifyPhoto(key, localUri);
  };

  const onRemovePhoto = (index: number) => {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== index) }));
  };

  // Every photo has an id the server will accept. A 'review' counts: it is
  // attachable, it just holds the report — which the details page says out loud
  // before the reporter gets here. 'verifying', 'reject' and 'failed' all block,
  // for three different reasons the rows on that page spell out individually.
  const photosReady =
    draft.photos.length > 0 &&
    draft.photos.every((p) => (p.state === 'pass' || p.state === 'review') && p.uploadId);

  const canProceedDetails =
    photosReady &&
    draft.title.trim().length > 0 &&
    draft.description.trim().length >= DESCRIPTION_MIN_LENGTH;

  const onBack = () => {
    if (page === 0) { navigation.goBack(); return; }
    setPage((p) => p - 1);
  };

  const onNext = () => setPage((p) => p + 1);

  const canPublish =
    confirmed && photosReady && !locating && draft.lat !== null && draft.lng !== null;

  const publishMutation = useMutation({
    mutationFn: () => {
      // Narrowed here rather than trusted from `canPublish`: mutationFn is the
      // only place the payload is built, so it is the only place these have to
      // be non-null for the types to hold.
      if (draft.lat === null || draft.lng === null) {
        throw new ApiError(0, t('flow.publishError'));
      }
      return createReport({
        categoryKey: selectedCategory,
        title: draft.title.trim(),
        description: draft.description.trim(),
        lat: draft.lat,
        lng: draft.lng,
        landmark: draft.landmark.trim() || undefined,
        anonymous,
        phoneVisible: draft.phoneVisible,
        neededVolunteers: Math.min(draft.neededVolunteers, config.maxVolunteersPerReport),
        // The expiry the reporter actually picked. Without this the whole
        // control on ReportLocationPage — six preset chips and a free hours
        // field — was collected, validated, and thrown away: every report got
        // the category default, up to 72h for Community Help, with nothing on
        // screen saying so. `undefined` means "no choice made", which is what
        // lets the category default stand.
        expiryMinutes:
          draft.customExpiryHours === null ? undefined : draft.customExpiryHours * 60,
        // Verified-upload ids, not URLs. `photosReady` has already established
        // that every photo has one, so the filter narrows the type rather than
        // silently dropping a photo the reporter can see on screen.
        photoUploadIds: draft.photos
          .map((p) => p.uploadId)
          .filter((id): id is string => Boolean(id)),
      });
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ['myReports'] });
      setCreated(report);
      // publishGuard stays latched deliberately. The modal is now the only exit
      // from this screen, and the draft's upload ids have been spent — a second
      // POST could only ever produce a duplicate report or PHOTO_NOT_VERIFIED.
    },
    onError: (e) => {
      publishGuard.current = false;
      const code = e instanceof ApiError ? e.code : undefined;
      // A photo-gate refusal gets its own sentence, in the reporter's language,
      // because it is the one class of publish failure they can act on: the
      // photos have to be captured again. Everything else is the generic
      // message — the API's own `message` is English-only and this app is not.
      const photoCopyKey = publishErrorCopyKey(code);
      setError(photoCopyKey ? t(photoCopyKey) : t('flow.publishError'));
    },
  });

  const onPublishInternal = () => {
    // Latched BEFORE mutate(), and in a ref. `publishMutation.isPending` is
    // state: two taps in the same frame both read `false` and both POST, which
    // is two identical live reports and two sets of spent upload ids.
    if (publishGuard.current || !canPublish) return;
    publishGuard.current = true;
    setError('');
    publishMutation.mutate();
  };

  // Read off the created report, never derived from the draft's own verdicts —
  // the client's photo states are an input to the server's decision, not the
  // decision itself, and a client that decides this for itself will eventually
  // disagree with the report it just created.
  const heldForReview = created?.status === 'pending_review';

  // Through the catalogue, not a literal array. This is the nav header on both
  // steps of the report flow — a hardcoded English array here is invisible to a
  // JSX-text i18n sweep, which is exactly how it survived one.
  const pageTitles = [t('flow.pageAddDetails'), t('flow.pageLocationPrivacy')];

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

      {/* ── Progress bar (2 steps only: Add Details & Location) ── */}
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
        {/* ── PAGE 0: Details ── */}
        {page === 0 && (
          <ReportDetailsPage
            draft={draft}
            categoryKey={selectedCategory}
            // KNOWN LIMITATION, deliberately not "fixed" here. A photo's verdict
            // is computed against the category that was selected when it was
            // captured (relevance is judged against that category's expected
            // labels), so changing the category afterwards leaves the verdict
            // stale. Re-verifying every photo on every category tap would spend
            // the reporter's upload rate limit — and a paid provider call — on
            // somebody scrolling a dropdown. The exposure is small: category
            // relevance only ever produces `review`, never `reject`, so the
            // worst case is a report that should have been held isn't. The real
            // fix belongs server-side, re-checking relevance at attach time.
            onChangeCategory={(catKey) => setSelectedCategory(catKey as CategoryId)}
            onChangeTitle={(title) => setDraft((d) => ({ ...d, title }))}
            onChangeDescription={(description) => setDraft((d) => ({ ...d, description }))}
            onChangeNeededVolunteers={(neededVolunteers) =>
              setDraft((d) => ({ ...d, neededVolunteers }))
            }
            maxPhotos={config.maxPhotosPerReport}
            maxVolunteers={config.maxVolunteersPerReport}
            onTakePhoto={() => capturePhoto()}
            onRemovePhoto={onRemovePhoto}
            onRetakePhoto={(index) => capturePhoto(index)}
          />
        )}

        {/* ── PAGE 1: Location & Privacy ── */}
        {page === 1 && (
          <ReportLocationPage
            locating={locating}
            locationLabel={draft.locationLabel}
            landmark={draft.landmark}
            anonymous={anonymous}
            allowAnonymous={config.allowAnonymousReports}
            phoneVisible={draft.phoneVisible}
            confirmed={confirmed}
            category={category}
            customExpiryHours={draft.customExpiryHours}
            onChangeLandmark={(landmark) => setDraft((d) => ({ ...d, landmark }))}
            onToggleAnonymous={(anonymous) => setDraft((d) => ({ ...d, anonymous }))}
            onTogglePhoneVisible={(phoneVisible) => setDraft((d) => ({ ...d, phoneVisible }))}
            onToggleConfirmed={(val) => setConfirmed(val)}
            onChangeCustomExpiryHours={(h) => setDraft((d) => ({ ...d, customExpiryHours: h }))}
          />
        )}

        {page === 1 && locationError ? (
          <View style={styles.locationErrorBox}>
            <Text style={styles.locationErrorText}>{locationError}</Text>
            <TouchableOpacity onPress={fetchLocation}>
              <Text style={styles.locationRetryText}>{t('flowExtra.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {/* ── Footer button (page 0 = Details, page 1 = Location & Publish) ── */}
      {page === 0 && (
        <View style={styles.footer}>
          <Button
            label={t('flow.nextLocationPrivacy')}
            onPress={onNext}
            disabled={!canProceedDetails}
          />
        </View>
      )}
      {page === 1 && (
        <View style={styles.footer}>
          {/* Repeated from the details page on purpose. This is the button that
              commits, and it is labelled "Publish" — a reporter who scrolled
              past the notice two screens ago would otherwise tap it believing
              help is being summoned right now. */}
          {draft.photos.some((p) => p.state === 'review') && (
            <Text style={styles.holdFooterNote}>{t('photoVerification.heldNotice')}</Text>
          )}
          <Button
            label={t('flow.publish')}
            onPress={onPublishInternal}
            loading={publishMutation.isPending}
            disabled={!canPublish}
          />
        </View>
      )}

      {/* ── Success modal ──
          Two variants, because there are two outcomes. "Your request is now
          live for nearby volunteers" is simply false for a held report: nobody
          can see it, and telling the reporter otherwise means they stand there
          waiting for help that was never dispatched. The server decides which
          one this is (status 'pending_review'), not the client's guess about
          its own photos. */}
      <Modal visible={Boolean(created)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successCard}>
            {heldForReview ? (
              <View style={[styles.successIconBadge, styles.pendingIconBadge]}>
                <Clock size={36} color={TONES.soon.fg} />
              </View>
            ) : (
              <View style={styles.successIconBadge}>
                <CheckCircle2 size={36} color={colors.primaryGreen} />
              </View>
            )}
            <Text style={styles.successTitle}>
              {heldForReview ? t('flowExtra.postedPendingTitle') : t('flowExtra.postedTitle')}
            </Text>
            <Text style={styles.successSub}>
              {heldForReview ? t('flowExtra.postedPendingMessage') : t('flowExtra.postedMessage')}
            </Text>
            <View style={styles.successBtnStack}>
              <Button
                label={t('flowExtra.viewRequest')}
                onPress={() => {
                  const id = created?.id;
                  setCreated(null);
                  if (id) navigation.replace('RequestDetails', { reportId: id });
                }}
              />
              <TouchableOpacity
                style={styles.homeBtn}
                onPress={() => { setCreated(null); navigation.navigate('MainTabs'); }}
              >
                <Text style={styles.homeBtnText}>{t('flowExtra.goHome')}</Text>
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
    holdFooterNote: {
      ...TYPE.caption,
      color: TONES.soon.fg,
      marginBottom: SPACING.xs,
      lineHeight: 16,
    },
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
    catTitle: { ...TYPE.headlineStrong, color: colors.textPrimary, marginBottom: 2 },
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
    // Amber, not green. The badge is the first thing read, and a green tick
    // over "your request is being checked" contradicts the sentence under it.
    pendingIconBadge: { backgroundColor: TONES.soon.fill },
    successTitle: { ...TYPE.display, color: colors.textPrimary },
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
