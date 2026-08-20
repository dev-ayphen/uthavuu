import { useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { PhotoDraft } from '../reportDraft';

const MAX_PHOTOS = 4;

type Props = {
  photos: PhotoDraft[];
  onAdd: () => void;
  onRemove: (index: number) => void;
};

// docs/features/report-a-request.md BR-1: at least one, up to 4, camera-only
// (never a gallery picker — see ReportFlowScreen's onAdd, which only calls
// expo-image-picker's launchCameraAsync).
export default function PhotoStep({ photos, onAdd, onRemove }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>Add a photo</Text>
      <Text style={styles.subtitle}>
        A live photo is required — it's what makes your report trustworthy to nearby volunteers.
      </Text>

      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <View key={photo.localUri} style={styles.tile}>
            <Image source={{ uri: photo.localUri }} style={styles.image} />
            {photo.uploading && (
              <View style={styles.overlay}>
                <ActivityIndicator color={colors.textOnTint} />
              </View>
            )}
            {photo.error ? (
              <TouchableOpacity
                style={styles.overlay}
                onPress={() => onRemove(index)}
                accessibilityRole="button"
                accessibilityLabel={`Upload failed: ${photo.error}. Double tap to remove.`}
              >
                <Text style={styles.errorText} numberOfLines={2}>
                  {photo.error} — tap to remove
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.removeBadge}
              onPress={() => onRemove(index)}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <X size={ICON_SIZE.xs} color={colors.textOnTint} strokeWidth={3} />
            </TouchableOpacity>
          </View>
        ))}

        {photos.length < MAX_PHOTOS && (
          <TouchableOpacity
            style={styles.addTile}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
          >
            <Camera size={ICON_SIZE.lg} color={colors.textSecondary} />
            <Text style={styles.addLabel}>{photos.length === 0 ? 'Take Photo' : 'Add Another'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const TILE_SIZE = 100;

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    tile: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: RADIUS.lg, overflow: 'hidden' },
    image: { width: '100%', height: '100%' },
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(15,23,42,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xxs,
    },
    errorText: { ...TYPE.caption, color: colors.textOnTint, textAlign: 'center' },
    removeBadge: {
      position: 'absolute',
      top: SPACING.xxs,
      right: SPACING.xxs,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(15,23,42,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    addTile: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      borderRadius: RADIUS.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.xxs,
    },
    addLabel: { ...TYPE.caption, color: colors.textSecondary, textAlign: 'center' },
  });
