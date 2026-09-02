import { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, ChevronDown, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import Spinner from '@uthavu/libs-mobile/components/Spinner';
import { RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import { CATEGORIES } from '@uthavu/libs-mobile/data/categories';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { DESCRIPTION_MIN_LENGTH, type ReportDraft } from '../reportDraft';

type Props = {
  draft: ReportDraft;
  categoryKey: string;
  onChangeCategory: (catKey: string) => void;
  onChangeTitle: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangeNeededVolunteers: (v: number) => void;
  // GET /config's maxPhotosPerReport / maxVolunteersPerReport. Both used to be
  // implicit here — two hand-written photo slots (plus a `MAX_PHOTOS = 2` that
  // nothing read) and a stepper clamped to 99, which the server has never
  // accepted. The API is the authority on both now.
  maxPhotos: number;
  maxVolunteers: number;
  onTakePhoto: () => void;
  onRemovePhoto: (index: number) => void;
};

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
  onChangeCategory,
  onChangeTitle,
  onChangeDescription,
  onChangeNeededVolunteers,
  maxPhotos,
  maxVolunteers,
  onTakePhoto,
  onRemovePhoto,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('report');
  const [modalOpen, setModalOpen] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cat = CATEGORIES.find((c) => c.id === categoryKey);
  const acc = CAT_ACCENT[categoryKey] ?? { iconBg: colors.bgElevated };

  return (
    <View style={styles.root}>

      {/* ── Category Selector Dropdown Field ── */}
      <Text style={styles.sectionLabel}>Category <Text style={styles.required}>*</Text></Text>
      <TouchableOpacity
        style={styles.categoryDropdown}
        onPress={() => setModalOpen(true)}
        activeOpacity={0.8}
      >
        <View style={styles.categoryDropdownLeft}>
          <Text style={styles.catEmoji}>{cat?.emoji}</Text>
          <Text style={styles.categoryDropdownTitle}>{cat?.title}</Text>
        </View>
        <ChevronDown size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {/* Category Selection Modal Sheet */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalOpen(false)}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.catOptionRow, c.id === categoryKey && styles.catOptionSelected]}
                onPress={() => {
                  onChangeCategory(c.id);
                  setModalOpen(false);
                }}
              >
                <Text style={styles.catOptionEmoji}>{c.emoji}</Text>
                <Text style={[styles.catOptionTitle, c.id === categoryKey && styles.catOptionTitleSelected]}>
                  {c.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Media slots, one per photo the platform allows ── */}
      <Text style={styles.sectionLabel}>
        Photos <Text style={styles.required}>*</Text>
      </Text>

      <View style={styles.mediaBox3}>
        {Array.from({ length: maxPhotos }, (_, i) => {
          const photo = draft.photos[i];
          const slotLabel = t('details.photoSlot', { n: i + 1 });
          return photo ? (
            <View key={i} style={styles.photoSlotFilled}>
              <Image source={{ uri: photo.localUri }} style={styles.thumbImg} />
              {photo.uploading && (
                <View style={styles.thumbOverlay}>
                  <Spinner variant="onTint" size="small" />
                </View>
              )}
              <View style={styles.slotBadge}>
                <Text style={styles.slotBadgeText}>{slotLabel}</Text>
              </View>
              <TouchableOpacity style={styles.thumbRemove} onPress={() => onRemovePhoto(i)}>
                <X size={10} color="#FFFFFF" strokeWidth={3} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              key={i}
              style={styles.photoSlotEmpty}
              onPress={onTakePhoto}
              activeOpacity={0.8}
            >
              <View style={[styles.slotIconBadge, { backgroundColor: colors.primaryGreenLight }]}>
                <Camera size={18} color={colors.primaryGreen} />
              </View>
              <Text style={styles.slotTitle}>{slotLabel}</Text>
              <Text style={styles.slotSub}>{t('details.photoSlotTapToAdd')}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
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

      {/* ── Volunteers Needed Stepper & Quick Selector ── */}
      <Text style={styles.sectionLabel}>Volunteers Needed</Text>
      <View style={styles.stepperContainer}>
        {/* Quick presets 1..5 */}
        <View style={styles.volunteerRow}>
          {[1, 2, 3, 4, 5]
            .filter((n) => n <= maxVolunteers)
            .map((n) => {
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

        {/* Stepper Control */}
        <View style={styles.stepperControl}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => onChangeNeededVolunteers(Math.max(1, draft.neededVolunteers - 1))}
            disabled={draft.neededVolunteers <= 1}
          >
            <Text style={[styles.stepperBtnText, draft.neededVolunteers <= 1 && styles.stepperBtnDisabled]}>−</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.stepperInput}
            value={String(draft.neededVolunteers)}
            onChangeText={(v) => {
              const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
              onChangeNeededVolunteers(isNaN(num) ? 1 : Math.max(1, Math.min(maxVolunteers, num)));
            }}
            keyboardType="number-pad"
            maxLength={String(maxVolunteers).length}
          />

          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() =>
              onChangeNeededVolunteers(Math.min(maxVolunteers, draft.neededVolunteers + 1))
            }
            disabled={draft.neededVolunteers >= maxVolunteers}
          >
            <Text
              style={[
                styles.stepperBtnText,
                draft.neededVolunteers >= maxVolunteers && styles.stepperBtnDisabled,
              ]}
            >
              +
            </Text>
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { paddingBottom: SPACING.md },

    categoryDropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: 10,
      marginBottom: SPACING.sm,
    },
    categoryDropdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    catEmoji: { fontSize: 18 },
    categoryDropdownTitle: { ...TYPE.bodyStrong, color: colors.textPrimary },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.6)',
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      padding: SPACING.lg,
      paddingBottom: SPACING.xxxl,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    sheetTitle: { ...TYPE.title, color: colors.textPrimary },
    catOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xs,
      borderRadius: RADIUS.md,
    },
    catOptionSelected: { backgroundColor: colors.primaryGreenLight },
    catOptionEmoji: { fontSize: 20 },
    catOptionTitle: { ...TYPE.body, color: colors.textPrimary },
    catOptionTitleSelected: { ...TYPE.bodyStrong, color: colors.primaryGreen },

    sectionLabel: {
      ...TYPE.subheadStrong,
      color: colors.textPrimary,
      marginBottom: SPACING.xs,
      marginTop: SPACING.md,
    },
    required: { color: colors.danger },
    mediaBox3: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    // flexBasis + flexGrow rather than flex:1 — the slot count is driven by
    // maxPhotosPerReport now, so two slots share one row and four wrap onto
    // two, without the row squeezing them to unusable slivers.
    photoSlotFilled: {
      flexBasis: '48%',
      flexGrow: 1,
      height: 90,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      position: 'relative',
    },
    photoSlotEmpty: {
      flexBasis: '48%',
      flexGrow: 1,
      height: 90,
      borderRadius: RADIUS.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    slotIconBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    slotTitle: { ...TYPE.footnote, fontWeight: '700', color: colors.textPrimary },
    slotSub: { ...TYPE.microLabel, color: colors.textSecondary },
    mediaCardSub: { ...TYPE.microLabel, color: colors.textSecondary, textAlign: 'center' },

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
    slotBadge: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      backgroundColor: 'rgba(15,23,42,0.7)',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    slotBadgeText: { ...TYPE.microLabel, color: '#FFFFFF', fontSize: 8.5 },
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

    // Volunteer Stepper Controls
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    volunteerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    volChip: {
      flex: 1,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.md,
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

    stepperControl: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 2,
    },
    stepperBtn: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    stepperBtnText: { ...TYPE.title, color: colors.primaryGreen, fontWeight: '800' },
    stepperBtnDisabled: { color: colors.disabled },
    stepperInput: {
      width: 40,
      height: 36,
      textAlign: 'center',
      ...TYPE.bodyStrong,
      color: colors.textPrimary,
    },
  });
