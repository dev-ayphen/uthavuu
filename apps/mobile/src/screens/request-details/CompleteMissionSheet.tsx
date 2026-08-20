import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SIZES, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { completeMission } from '@uthavu/libs-mobile/api/missions';
import { uploadImage } from '@uthavu/libs-mobile/api/users';
import { ApiError } from '@uthavu/libs-mobile/lib/api';
import Button from '@uthavu/libs-mobile/components/Button';
import TextField from '@uthavu/libs-mobile/components/TextField';

type Props = {
  visible: boolean;
  reportId: string;
  onComplete: () => void;
  onClose: () => void;
};

// docs/features/mission-completion.md US-1 — camera-only capture (no
// gallery picker), a required note, then a single submit call. No
// "verification pending" UI state: BR-4/US-2 AC3 — today's verification
// resolves synchronously, the caller finds out success/failure immediately.
export default function CompleteMissionSheet({ visible, reportId, onComplete, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation(['requestDetails', 'common']);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onTakePhoto = async () => {
    setPhotoError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setPhotoError(t('cameraPermissionError'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const uri = result.assets[0].uri;
    setLocalPhotoUri(uri);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadImage(uri);
      setPhotoUrl(uploaded.url);
    } catch {
      setPhotoError(t('photoUploadError'));
      setPhotoUrl(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const isValid = !!photoUrl && note.trim().length > 0;

  const onSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await completeMission(reportId, photoUrl!, note.trim());
      onComplete();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('submitCompletionError');
      setError(message);
      Alert.alert(t('notCompletedTitle'), message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('completeMissionTitle')}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common:close')}>
              <X size={ICON_SIZE.md} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.photoBox}
            onPress={onTakePhoto}
            disabled={uploadingPhoto}
            accessibilityRole="button"
            accessibilityLabel={photoUrl ? t('retakePhotoAccessibilityLabel') : t('takePhotoAccessibilityLabel')}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={colors.primaryGreen} />
            ) : localPhotoUri ? (
              <Text style={styles.photoBoxText}>{t('photoCapturedText')}</Text>
            ) : (
              <>
                <Camera size={ICON_SIZE.lg} color={colors.primaryGreen} />
                <Text style={styles.photoBoxText}>{t('takeAPhoto')}</Text>
              </>
            )}
          </TouchableOpacity>
          {photoError ? <Text style={styles.error}>{photoError}</Text> : null}

          <TextField
            value={note}
            onChangeText={setNote}
            placeholder={t('notePlaceholder')}
            multiline
            accessibilityLabel={t('noteAccessibilityLabel')}
            style={styles.noteField}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label={t('common:submit')} onPress={onSubmit} disabled={!isValid} loading={submitting} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.pill,
      borderTopRightRadius: RADIUS.pill,
      padding: SIZES.padding,
      paddingBottom: SPACING.xxxl,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
    title: { ...TYPE.screenTitle, color: colors.textPrimary },
    photoBox: {
      height: 140,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.xs,
      marginBottom: SPACING.sm,
    },
    photoBoxText: { ...TYPE.subhead, color: colors.textSecondary },
    noteField: { marginBottom: SPACING.sm, minHeight: 80 },
    error: { ...TYPE.body, color: colors.danger, marginBottom: SPACING.xs, textAlign: 'center' },
  });
