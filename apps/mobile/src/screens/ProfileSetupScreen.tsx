import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Briefcase, Building2, Camera, ChevronDown, Globe, Mail, MapPin, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { ICON_SIZE, SIZES, SPACING, TYPE } from '../theme/tokens';
import type { ColorScheme } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { completeProfileSetup, uploadImage } from '../api/users';
import { markOnboardingSeen } from '../lib/session';
import { ApiError } from '../lib/api';
import { PROFESSIONS, type ProfessionId } from '../data/professions';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import TextField from '../components/TextField';
import ToggleRow from '../components/ToggleRow';
import ProfessionPicker from '../components/ProfessionPicker';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileSetup'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// auth.md BR-5 (revised 2026-08-19): Full Name is still the only required
// field, but this screen now collects the rest of the optional profile in
// one pass (US-3/US-3a) instead of deferring it to a not-yet-built Profile
// Settings screen. There's still no "Skip" — every other field can simply be
// left blank and submitted that way.
export default function ProfileSetupScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const { lat, lng, city, district } = route.params;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('');
  const [organization, setOrganization] = useState('');
  const [professionId, setProfessionId] = useState<ProfessionId | null>(null);
  const [professionOtherText, setProfessionOtherText] = useState('');
  const [showProfession, setShowProfession] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const emailValid = email.trim() === '' || EMAIL_REGEX.test(email.trim());
  const isValid = name.trim().length > 0 && emailValid;

  const selectedProfession = PROFESSIONS.find((p) => p.id === professionId);

  const professionLabel = (): string | undefined => {
    if (!professionId) return undefined;
    if (professionId === 'other') return professionOtherText.trim() || undefined;
    return selectedProfession?.label;
  };

  const onSelectProfession = (id: ProfessionId) => {
    setPickerOpen(false);
    if (id === 'none') {
      setProfessionId(null);
      setProfessionOtherText('');
      return;
    }
    setProfessionId(id);
    if (id !== 'other') setProfessionOtherText('');
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    setPhotoError('');
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setPhotoError(`Permission needed to access your ${source === 'camera' ? 'camera' : 'photos'}.`);
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setLocalPhotoUri(uri);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadImage(uri);
      setAvatarUrl(uploaded.url);
    } catch {
      // US-3a AC3 — the rest of the form still works without a photo.
      setPhotoError('Could not upload photo. Tap to try again, or continue without one.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onPickPhoto = () => {
    if (uploadingPhoto) return;
    Alert.alert('Profile Photo', 'Add a photo so others can recognize you.', [
      { text: 'Take Photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from Library', onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onComplete = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await completeProfileSetup({
        fullName: name.trim(),
        lat,
        lng,
        city,
        district,
        contactEmail: email.trim() || undefined,
        language: language.trim() || undefined,
        profession: professionLabel(),
        organization: organization.trim() || undefined,
        showProfession,
        avatarUrl: avatarUrl || undefined,
      });
      await markOnboardingSeen();
      navigation.replace('MainTabs');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your profile. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>
          Your name is shown on reports you post, unless you choose to post anonymously.
        </Text>

        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={onPickPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add profile photo"
        >
          <Avatar uri={localPhotoUri} label={name} size={84} />
          <View style={styles.avatarBadge}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color={colors.textOnTint} />
            ) : (
              <Camera size={14} color={colors.textOnTint} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarLabel}>{uploadingPhoto ? 'Uploading…' : 'Add profile photo'}</Text>
        {photoError ? <Text style={styles.error}>{photoError}</Text> : null}

        <TextField
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          icon={<User size={ICON_SIZE.sm} color={colors.textSecondary} />}
          autoCapitalize="words"
          autoFocus
          accessibilityLabel="Full name"
          style={styles.field}
        />

        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder="Email address (optional)"
          icon={<Mail size={ICON_SIZE.sm} color={colors.textSecondary} />}
          keyboardType="email-address"
          autoCapitalize="none"
          error={!emailValid ? 'Enter a valid email' : undefined}
          accessibilityLabel="Email address"
          style={styles.field}
        />

        <TextField
          value={language}
          onChangeText={setLanguage}
          placeholder="Preferred language (optional)"
          icon={<Globe size={ICON_SIZE.sm} color={colors.textSecondary} />}
          autoCapitalize="words"
          accessibilityLabel="Preferred language"
          style={styles.field}
        />

        <TouchableOpacity
          style={styles.pickerRow}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Profession"
        >
          <Briefcase size={ICON_SIZE.sm} color={colors.textSecondary} />
          <Text style={[styles.pickerRowText, !professionId && styles.placeholder]}>
            {professionId ? `${selectedProfession?.emoji} ${selectedProfession?.label}` : 'Profession (optional)'}
          </Text>
          <ChevronDown size={ICON_SIZE.sm} color={colors.textSecondary} />
        </TouchableOpacity>

        {professionId === 'other' && (
          <TextField
            value={professionOtherText}
            onChangeText={setProfessionOtherText}
            placeholder="Enter your profession"
            accessibilityLabel="Enter your profession"
            style={styles.field}
          />
        )}

        <TextField
          value={organization}
          onChangeText={setOrganization}
          placeholder="Organization (optional)"
          icon={<Building2 size={ICON_SIZE.sm} color={colors.textSecondary} />}
          autoCapitalize="words"
          accessibilityLabel="Organization"
          style={styles.field}
        />

        <ToggleRow
          label="Show profession on public profile"
          value={showProfession}
          onValueChange={setShowProfession}
          style={styles.toggleRow}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.locationRow}>
          <MapPin size={14} color={colors.textSecondary} />
          <Text style={styles.locationText}>
            {city ? `${city}, ${district}` : district || 'Detecting your area…'}
          </Text>
        </View>

        <Button
          label="Complete Profile"
          onPress={onComplete}
          disabled={!isValid}
          loading={submitting}
          style={styles.completeButton}
        />
      </ScrollView>

      <ProfessionPicker
        visible={pickerOpen}
        selectedId={professionId}
        onSelect={onSelectProfession}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    container: {
      padding: SIZES.padding,
      paddingTop: insets.top + SPACING.md,
      paddingBottom: insets.bottom + SPACING.xl,
    },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    avatarWrap: { alignSelf: 'center', position: 'relative' },
    avatarBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primaryGreen,
      borderWidth: 2,
      borderColor: colors.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarLabel: {
      ...TYPE.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.xs,
    },
    field: { marginTop: SPACING.md },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: SIZES.radiusInput,
      paddingHorizontal: SPACING.sm + 2,
      gap: SPACING.xs,
      marginTop: SPACING.md,
    },
    pickerRowText: { flex: 1, ...TYPE.headline, color: colors.textPrimary },
    placeholder: { color: colors.textSecondary },
    toggleRow: { marginTop: SPACING.lg },
    error: { ...TYPE.body, color: colors.danger, marginTop: SPACING.xs, textAlign: 'center' },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs, marginTop: SPACING.lg },
    locationText: { ...TYPE.body, color: colors.textSecondary },
    completeButton: { marginTop: SPACING.xl },
  });
