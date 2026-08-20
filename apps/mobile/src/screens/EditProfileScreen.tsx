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
import { Briefcase, Building2, Camera, ChevronDown, Globe, Mail, MapPin, Phone, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { ICON_SIZE, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { completeProfileSetup, getMe, uploadImage } from '@uthavu/libs-mobile/api/users';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import { PROFESSIONS, type ProfessionId } from '@uthavu/libs-mobile/data/professions';
import Avatar from '@uthavu/libs-mobile/components/Avatar';
import Button from '@uthavu/libs-mobile/components/Button';
import TextField from '@uthavu/libs-mobile/components/TextField';
import ToggleRow from '@uthavu/libs-mobile/components/ToggleRow';
import ProfessionPicker from '@uthavu/libs-mobile/components/ProfessionPicker';
import BackButton from '@uthavu/libs-mobile/components/BackButton';
import Skeleton from '@uthavu/libs-mobile/components/Skeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors ProfileSetupScreen's fields exactly (same PATCH /users/me, same
// CompleteProfileDto) — this is the returning-user path into that same
// data, which previously had no screen at all after onboarding. Phone and
// location are read-only here: re-verifying a phone number or moving your
// registered area are each their own feature, not part of editing a name
// or photo. lat/lng/city/district are still sent on save, unchanged, since
// the DTO requires them even on an edit.
export default function EditProfileScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const queryClient = useQueryClient();

  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: getMe });

  return isLoading || !me ? (
    <EditProfileSkeleton insets={insets} colors={colors} />
  ) : (
    <EditProfileForm me={me} colors={colors} insets={insets} styles={styles} navigation={navigation} queryClient={queryClient} />
  );
}

function EditProfileForm({
  me,
  colors,
  styles,
  navigation,
  queryClient,
}: {
  me: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof getMe>>>>['data']>;
  colors: ColorScheme;
  insets: { top: number; bottom: number };
  styles: ReturnType<typeof createStyles>;
  navigation: Props['navigation'];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [name, setName] = useState(me.name ?? '');
  const [email, setEmail] = useState(me.contactEmail ?? '');
  const [language, setLanguage] = useState(me.language ?? '');
  const [organization, setOrganization] = useState(me.organization ?? '');
  const initialProfession = PROFESSIONS.find((p) => p.label === me.profession);
  const [professionId, setProfessionId] = useState<ProfessionId | null>(
    initialProfession ? initialProfession.id : me.profession ? 'other' : null
  );
  const [professionOtherText, setProfessionOtherText] = useState(
    !initialProfession && me.profession ? me.profession : ''
  );
  const [showProfession, setShowProfession] = useState(me.showProfession);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const emailValid = email.trim() === '' || EMAIL_REGEX.test(email.trim());
  const isValid = name.trim().length > 0 && emailValid && me.lastLat != null && me.lastLng != null;

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

  const onSave = async () => {
    if (!isValid || submitting || me.lastLat == null || me.lastLng == null) return;
    setSubmitting(true);
    setError('');
    try {
      const updated = await completeProfileSetup({
        fullName: name.trim(),
        lat: me.lastLat,
        lng: me.lastLng,
        city: me.city ?? '',
        district: me.district ?? '',
        contactEmail: email.trim() || undefined,
        language: language.trim() || undefined,
        profession: professionLabel(),
        organization: organization.trim() || undefined,
        showProfession,
        avatarUrl: avatarUrl || undefined,
      });
      queryClient.setQueryData(['me'], updated);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your profile. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BackButton style={styles.backButton} />
        <Text style={styles.title}>Edit profile</Text>
        <Text style={styles.subtitle}>Your name is shown on reports you post, unless you post anonymously.</Text>

        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={onPickPhoto}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
        >
          <Avatar uri={localPhotoUri ?? avatarUrl} label={name || me.name} size={84} />
          <View style={styles.avatarBadge}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color={colors.textOnTint} />
            ) : (
              <Camera size={14} color={colors.textOnTint} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarLabel}>{uploadingPhoto ? 'Uploading…' : 'Change photo'}</Text>
        {photoError ? <Text style={styles.error}>{photoError}</Text> : null}

        <TextField
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          icon={<User size={ICON_SIZE.sm} color={colors.textSecondary} />}
          autoCapitalize="words"
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
            {professionId
              ? professionId === 'other'
                ? professionOtherText || 'Other'
                : `${selectedProfession?.emoji} ${selectedProfession?.label}`
              : 'Profession (optional)'}
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

        <View style={styles.readOnlyBlock}>
          <View style={styles.readOnlyRow}>
            <Phone size={14} color={colors.textSecondary} />
            <Text style={styles.readOnlyText}>{me.phoneNumber}</Text>
          </View>
          <View style={styles.readOnlyRow}>
            <MapPin size={14} color={colors.textSecondary} />
            <Text style={styles.readOnlyText}>
              {me.city ? `${me.city}, ${me.district}` : 'Location not set'}
            </Text>
          </View>
        </View>

        <Button label="Save changes" onPress={onSave} disabled={!isValid} loading={submitting} style={styles.saveButton} />
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

function EditProfileSkeleton({ insets, colors }: { insets: { top: number; bottom: number }; colors: ColorScheme }) {
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  return (
    <View style={styles.container}>
      <BackButton style={styles.backButton} />
      <Skeleton width={84} height={84} borderRadius={42} style={styles.avatarSkeleton} />
      <Skeleton width="100%" height={48} style={styles.field} />
      <Skeleton width="100%" height={48} style={styles.field} />
      <Skeleton width="100%" height={48} style={styles.field} />
    </View>
  );
}

const createStyles = (colors: ColorScheme, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    container: {
      flexGrow: 1,
      backgroundColor: colors.bg,
      padding: SIZES.padding,
      paddingTop: insets.top + SPACING.md,
      paddingBottom: insets.bottom + SPACING.xl,
    },
    backButton: { marginBottom: SPACING.sm },
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    avatarWrap: { alignSelf: 'center', position: 'relative' },
    avatarSkeleton: { alignSelf: 'center', marginBottom: SPACING.lg },
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
    readOnlyBlock: {
      marginTop: SPACING.lg,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: SPACING.xs,
    },
    readOnlyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xxs },
    readOnlyText: { ...TYPE.body, color: colors.textSecondary },
    saveButton: { marginTop: SPACING.xl },
  });
