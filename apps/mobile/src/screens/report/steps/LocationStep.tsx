import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import TextField from '@uthavu/libs-mobile/components/TextField';

type Props = {
  locating: boolean;
  locationLabel: string;
  landmark: string;
  onChangeLandmark: (value: string) => void;
};

// docs/features/report-a-request.md US-3/BR-4 — live GPS is the authoritative
// location (fetched automatically by ReportFlowScreen on mount, same pattern
// as PermissionsScreen); no draggable-pin map in v0.1 (no map library in the
// project yet). `landmark` is a human-readable helper only, never a
// replacement for lat/lng in matching.
export default function LocationStep({ locating, locationLabel, landmark, onChangeLandmark }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.title}>Confirm your location</Text>
      <Text style={styles.subtitle}>Nearby volunteers use this to find the situation.</Text>

      <View style={styles.locationRow}>
        <MapPin size={ICON_SIZE.sm} color={colors.primaryGreen} />
        {locating ? (
          <>
            <ActivityIndicator size="small" color={colors.primaryGreen} />
            <Text style={styles.locationText}>Detecting your location…</Text>
          </>
        ) : (
          <Text style={styles.locationText}>{locationLabel || 'Location unavailable'}</Text>
        )}
      </View>

      <TextField
        value={landmark}
        onChangeText={onChangeLandmark}
        placeholder="Landmark, e.g. 'Opposite the bus stop' (optional)"
        autoCapitalize="sentences"
        accessibilityLabel="Landmark"
        style={styles.field}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    title: { ...TYPE.pageTitle, color: colors.textPrimary, marginBottom: SPACING.xxs },
    subtitle: { ...TYPE.subhead, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: SPACING.sm + 2,
    },
    locationText: { ...TYPE.headline, color: colors.textPrimary, flexShrink: 1 },
    field: { marginTop: SPACING.md },
  });
