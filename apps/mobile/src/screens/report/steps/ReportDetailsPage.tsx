import { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, X } from 'lucide-react-native';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { CATEGORIES } from '@uthavu/libs-mobile/data/categories';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { DESCRIPTION_MIN_LENGTH, type ReportDraft } from '../reportDraft';

type Props = {
  draft: ReportDraft;
  categoryKey: string;
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangeNeededVolunteers: (v: number) => void;
  onTakePhoto: () => void;
  onRemovePhoto: (index: number) => void;
};

const MAX_PHOTOS = 4;

const CAT_ACCENT: Record<string, { iconBg: string }> = {
  animalRescue:   { iconBg: '#FEF3C7' },
  medicalHelp:    { iconBg: '#FFE4E6' },
  foodDonation:   { iconBg: '#DCFCE7' },
  roadsideHelp:   { iconBg: '#DBEAFE' },
  elderlySupport: { iconBg: '#EDE9FE' },
  bloodDonation:  { iconBg: '#FEE2E2' },
  communityHelp:  { iconBg: '#D1FAE5' },
  lostAndFound:   { iconBg: '#FEF9C3' },
};

export default function ReportDetailsPage({
  draft,
  categoryKey,
  onChangeTitle,
  onChangeDescription,
  onChangeNeededVolunteers,
  onTakePhoto,
  onRemovePhoto,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cat = CATEGORIES.find((c) => c.id === categoryKey);
  const acc = CAT_ACCENT[categoryKey] ?? { iconBg: colors.bgElevated };

  return (
    <View style={styles.root}>

      {/* ── Selected Category Badge ── */}
      {cat && (
        <View style={[styles.catBadge, { backgroundColor: acc.iconBg }]}>
          <Text style={styles.catEmoji}>{cat.emoji}</Text>
          <Text style={styles.catName}>{cat.title}</Text>
        </View>
      )}

      {/* ── Photo First ── */}
      <Text style={styles.sectionLabel}>Photo <Text style={styles.required}>*</Text></Text>

      {draft.photos.length === 0 ? (
        <TouchableOpacity style={styles.cameraTrigger} onPress={onTakePhoto} activeOpacity={0.85}>
          <View style={styles.cameraIconWrap}>
            <Camera size={28} color={colors.primaryGreen} />
          </View>
          <Text style={styles.cameraTriggerTitle}>Take a Live Photo</Text>
          <Text style={styles.cameraTriggerSub}>Photo is required to submit a report</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.photoGrid}>
          {draft.photos.map((photo, i) => (
            <View key={photo.localUri || i} style={styles.photoThumb}>
              <Image source={{ uri: photo.localUri }} style={styles.thumbImg} />
              {photo.uploading && (
                <View style={styles.thumbOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}
              <TouchableOpacity style={styles.thumbRemove} onPress={() => onRemovePhoto(i)}>
                <X size={10} color="#FFFFFF" strokeWidth={3} />
              </TouchableOpacity>
            </View>
          ))}
          {draft.photos.length < MAX_PHOTOS && (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={onTakePhoto}>
              <Camera size={20} color={colors.primaryGreen} />
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {draft.photos[0]?.error ? (
        <Text style={styles.photoError}>{draft.photos[0].error}</Text>
      ) : null}

      {/* ── Description ── */}
      <Text style={styles.sectionLabel}>
        What's happening? <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.textArea}
        value={draft.description}
        onChangeText={onChangeDescription}
        placeholder="Describe what help is needed..."
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="sentences"
        multiline
        textAlignVertical="top"
      />
      {draft.description.trim().length > 0 && draft.description.trim().length < DESCRIPTION_MIN_LENGTH && (
        <Text style={styles.photoError}>
          {DESCRIPTION_MIN_LENGTH - draft.description.trim().length} more characters needed — give
          volunteers enough to act on.
        </Text>
      )}

      {/* ── Title (optional short summary) ── */}
      <Text style={styles.sectionLabel}>Short Title <Text style={styles.required}>*</Text></Text>
      <TextInput
        style={styles.input}
        value={draft.title}
        onChangeText={onChangeTitle}
        placeholder="e.g. Injured dog near bus stop"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="sentences"
        returnKeyType="done"
      />

      {/* ── Volunteers Needed ── */}
      <Text style={styles.sectionLabel}>Volunteers Needed</Text>
      <View style={styles.volunteerRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = draft.neededVolunteers === n;
          return (
            <TouchableOpacity
              key={n}
              style={[styles.volChip, active && styles.volChipActive]}
              onPress={() => onChangeNeededVolunteers(n)}
            >
              <Text style={[styles.volChipText, active && styles.volChipTextActive]}>
                {n}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { paddingBottom: SPACING.md },

    catBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
      marginBottom: SPACING.lg,
    },
    catEmoji: { fontSize: 18 },
    catName: { ...TYPE.bodyStrong, color: colors.textPrimary, fontWeight: '700' },

    sectionLabel: {
      ...TYPE.subheadStrong,
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
      marginTop: SPACING.md,
    },
    required: { color: colors.danger },

    // Camera empty state
    cameraTrigger: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.xl,
      borderRadius: RADIUS.xl,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: colors.bgElevated,
      gap: 6,
    },
    cameraIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primaryGreenLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    cameraTriggerTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    cameraTriggerSub: { ...TYPE.caption, color: colors.textSecondary },

    // Photo thumbnails
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    photoThumb: {
      width: 80,
      height: 80,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
      position: 'relative',
    },
    thumbImg: { width: '100%', height: '100%' },
    thumbOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbRemove: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPhotoBtn: {
      width: 80,
      height: 80,
      borderRadius: RADIUS.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    addPhotoText: { ...TYPE.caption, color: colors.primaryGreen, fontWeight: '700' },
    photoError: { ...TYPE.caption, color: colors.danger, marginTop: 4 },

    // Inputs
    textArea: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      ...TYPE.body,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
      height: 96,
      textAlignVertical: 'top',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      ...TYPE.body,
      color: colors.textPrimary,
      backgroundColor: colors.bgElevated,
    },

    // Volunteer chips
    volunteerRow: { flexDirection: 'row', gap: SPACING.xs },
    volChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
    },
    volChipActive: {
      borderColor: colors.primaryGreen,
      backgroundColor: colors.primaryGreenLight,
    },
    volChipText: { ...TYPE.bodyStrong, color: colors.textSecondary },
    volChipTextActive: { color: colors.primaryGreen },
  });
