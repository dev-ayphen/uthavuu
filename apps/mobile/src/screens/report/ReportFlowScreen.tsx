import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { CATEGORIES } from '@uthavu/libs-mobile/data/categories';
import { listReportCategories, createReport } from '@uthavu/libs-mobile/api/reports';
import { uploadImage } from '@uthavu/libs-mobile/api/users';
import { reverseGeocode } from '@uthavu/libs-mobile/lib/geocode';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Button from '@uthavu/libs-mobile/components/Button';
import { EMPTY_DRAFT, type ReportDraft } from './reportDraft';
import PhotoStep from './steps/PhotoStep';
import DetailsStep from './steps/DetailsStep';
import LocationStep from './steps/LocationStep';
import PrivacyStep from './steps/PrivacyStep';
import ReviewStep from './steps/ReviewStep';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportFlow'>;

const STEPS = ['Photo', 'Details', 'Location', 'Privacy', 'Review'] as const;

export default function ReportFlowScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const { categoryKey } = route.params;
  const categoryMeta = CATEGORIES.find((c) => c.id === categoryKey);

  const { data: categories } = useQuery({ queryKey: ['reportCategories'], queryFn: listReportCategories });
  const category = categories?.find((c) => c.key === categoryKey);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
  const [locating, setLocating] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  // Location permission is mandatory at signup (auth.md BR-3) — no
  // permission prompt needed here, just read the current position.
  useEffect(() => {
    (async () => {
      try {
        const position = await Location.getCurrentPositionAsync({});
        const { latitude: lat, longitude: lng } = position.coords;
        const { city, district } = await reverseGeocode(lat, lng);
        setDraft((d) => ({ ...d, lat, lng, locationLabel: city ? `${city}, ${district}` : district }));
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  const onAddPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Camera needed', 'Uthavu needs camera access to attach a live photo to your report.');
      return;
    }
    // BR-1: camera capture only — launchImageLibraryAsync is never called here.
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
        photos: d.photos.map((p) => (p.localUri === localUri ? { ...p, uploadedUrl: uploaded.url, uploading: false } : p)),
      }));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Upload failed';
      setDraft((d) => ({
        ...d,
        photos: d.photos.map((p) => (p.localUri === localUri ? { ...p, uploading: false, error: message } : p)),
      }));
    }
  };

  const onRemovePhoto = (index: number) => {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, i) => i !== index) }));
  };

  const canProceed = (() => {
    switch (step) {
      case 0:
        return draft.photos.length > 0 && draft.photos.every((p) => p.uploadedUrl && !p.uploading);
      case 1:
        return draft.title.trim().length > 0 && draft.description.trim().length > 0;
      case 2:
        return draft.lat !== null && draft.lng !== null;
      default:
        return true;
    }
  })();

  const onBack = () => {
    if (step === 0) {
      navigation.goBack();
      return;
    }
    setStep((s) => s - 1);
  };

  const onPublish = async () => {
    if (draft.lat === null || draft.lng === null || publishing) return;
    setPublishing(true);
    setError('');
    try {
      await createReport({
        categoryKey,
        title: draft.title.trim(),
        description: draft.description.trim(),
        lat: draft.lat,
        lng: draft.lng,
        landmark: draft.landmark.trim() || undefined,
        anonymous: draft.anonymous,
        phoneVisible: draft.phoneVisible,
        neededVolunteers: draft.neededVolunteers,
        photoUrls: draft.photos.map((p) => p.uploadedUrl).filter((url): url is string => Boolean(url)),
      });
      Alert.alert('Report published', 'Nearby volunteers can now see your request.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not publish your report. Try again.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <BackButton onPress={onBack} />
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>
          {categoryMeta?.emoji} {STEPS[step]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && <PhotoStep photos={draft.photos} onAdd={onAddPhoto} onRemove={onRemovePhoto} />}
        {step === 1 && (
          <DetailsStep
            title={draft.title}
            description={draft.description}
            onChangeTitle={(title) => setDraft((d) => ({ ...d, title }))}
            onChangeDescription={(description) => setDraft((d) => ({ ...d, description }))}
            neededVolunteers={draft.neededVolunteers}
            onChangeNeededVolunteers={(neededVolunteers) => setDraft((d) => ({ ...d, neededVolunteers }))}
          />
        )}
        {step === 2 && (
          <LocationStep
            locating={locating}
            locationLabel={draft.locationLabel}
            landmark={draft.landmark}
            onChangeLandmark={(landmark) => setDraft((d) => ({ ...d, landmark }))}
          />
        )}
        {step === 3 && (
          <PrivacyStep
            anonymous={draft.anonymous}
            phoneVisible={draft.phoneVisible}
            onToggleAnonymous={(anonymous) => setDraft((d) => ({ ...d, anonymous }))}
            onTogglePhoneVisible={(phoneVisible) => setDraft((d) => ({ ...d, phoneVisible }))}
          />
        )}
        {step === 4 && <ReviewStep draft={draft} category={category} />}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        {step < STEPS.length - 1 ? (
          <Button label="Next" onPress={() => setStep((s) => s + 1)} disabled={!canProceed} />
        ) : (
          <Button label="Publish Report" onPress={onPublish} loading={publishing} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.sm },
    dots: { flexDirection: 'row', gap: SPACING.xxs, marginTop: SPACING.xs },
    dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
    dotActive: { backgroundColor: colors.primaryGreen },
    dotDone: { backgroundColor: colors.primaryGreen },
    stepLabel: { ...TYPE.captionStrong, color: colors.textSecondary, marginTop: SPACING.xs },
    content: { paddingHorizontal: SIZES.padding, paddingBottom: SPACING.xl },
    error: { ...TYPE.body, color: colors.danger, marginTop: SPACING.sm, textAlign: 'center' },
    footer: { paddingHorizontal: SIZES.padding, paddingTop: SPACING.xs },
  });
