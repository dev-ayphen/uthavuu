import { useMemo } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import Spinner from '@uthavu/libs-mobile/components/Spinner';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import type { ReportCategory } from '@uthavu/libs-mobile/api/reports';
import { formatExpiryMinutes } from '../reportDraft';

type Props = {
  locating: boolean;
  locationLabel: string;
  landmark: string;
  anonymous: boolean;
  phoneVisible: boolean;
  shareWithNGOs: boolean;
  confirmed?: boolean;
  category: ReportCategory | undefined;
  onChangeLandmark: (v: string) => void;
  onToggleAnonymous: (v: boolean) => void;
  onTogglePhoneVisible: (v: boolean) => void;
  onToggleConfirmed?: (v: boolean) => void;
  customExpiryHours: number | null;
  onChangeCustomExpiryHours: (h: number | null) => void;
};

export default function ReportLocationPage({
  locating,
  locationLabel,
  landmark,
  anonymous,
  phoneVisible,
  shareWithNGOs,
  confirmed = false,
  category,
  onChangeLandmark,
  onToggleAnonymous,
  onTogglePhoneVisible,
  onToggleConfirmed,
  customExpiryHours = null,
  onChangeCustomExpiryHours,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.root}>
      {/* ── Page heading ── */}
      <Text style={styles.pageTitle}>Location & Preferences</Text>
      <Text style={styles.pageSubtitle}>Set location, expiry duration and contact privacy.</Text>

      {/* ── Location ── */}
      <Text style={styles.label}>Location</Text>
      <View style={styles.locationCard}>
        {locating ? (
          <>
            <Spinner variant="standalone" size="small" />
            <Text style={styles.locationText}>Detecting location…</Text>
          </>
        ) : (
          <>
            <MapPin size={ICON_SIZE.sm} color={colors.primaryGreen} />
            <View style={styles.locationBody}>
              <Text style={styles.locationLabel} numberOfLines={1}>
                {locationLabel || 'Location unavailable'}
              </Text>
              <Text style={styles.locationAccuracy}>GPS Accuracy: High (5m)</Text>
            </View>
          </>
        )}
      </View>

      <TextInput
        style={styles.input}
        value={landmark}
        onChangeText={onChangeLandmark}
        placeholder="Landmark or street details (Optional)"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="sentences"
      />

      {/* ── Expected help window ── */}
      <Text style={styles.label}>Expected help window</Text>
      <Text style={styles.helpWindowCaption}>
        {category
          ? `Default: Open for ${formatExpiryMinutes(category.defaultExpiryMinutes)}. Override below if needed.`
          : 'Set a custom duration or pick a category to use its default.'}
      </Text>

      {/* Quick preset chips */}
      <View style={styles.expiryChipRow}>
        {[1, 2, 4, 6, 12, 24].map((h) => {
          const active = customExpiryHours === h;
          return (
            <TouchableOpacity
              key={h}
              style={[styles.expiryChip, active && styles.expiryChipActive]}
              onPress={() => onChangeCustomExpiryHours(active ? null : h)}
            >
              <Text style={[styles.expiryChipText, active && styles.expiryChipTextActive]}>
                {h}h
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Manual hour entry */}
      <View style={styles.expiryInputRow}>
        <Text style={styles.expiryInputLabel}>Or type hours:</Text>
        <TextInput
          style={styles.expiryInput}
          value={customExpiryHours != null ? String(customExpiryHours) : ''}
          onChangeText={(v) => {
            const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
            onChangeCustomExpiryHours(isNaN(num) ? null : Math.max(1, Math.min(720, num)));
          }}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="e.g. 48"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
        />
        <Text style={styles.expiryUnit}>hours</Text>
      </View>

      {/* ── Privacy & Notifications ── */}
      <Text style={styles.sectionTitle}>Privacy & Notifications</Text>

      <View style={styles.toggleCard}>
        {/* Post Anonymously */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={styles.toggleLabel}>Post Anonymously</Text>
          </View>
          <Switch
            value={anonymous}
            onValueChange={onToggleAnonymous}
            trackColor={{ false: colors.border, true: colors.primaryGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        {/* Share phone number */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={styles.toggleLabel}>Share phone number with volunteers</Text>
            <Text style={styles.toggleSub}>
              {phoneVisible
                ? 'Phone number visible to volunteers'
                : 'Phone hidden — volunteers contact via in-app chat only.'}
            </Text>
          </View>
          <Switch
            value={phoneVisible}
            onValueChange={onTogglePhoneVisible}
            trackColor={{ false: colors.border, true: colors.primaryGreen }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.divider} />

        {/* Share with NGOs (UI-only, always off) */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={styles.toggleLabel}>Share with local NGOs</Text>
          </View>
          <Switch
            value={shareWithNGOs}
            onValueChange={() => {}}
            trackColor={{ false: colors.border, true: colors.primaryGreen }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* ── Confirmation Checkbox ── */}
      <TouchableOpacity
        style={styles.confirmRow}
        onPress={() => onToggleConfirmed?.(!confirmed)}
        activeOpacity={0.8}
      >
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
          {confirmed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.confirmText}>I confirm that this information is accurate.</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { paddingBottom: SPACING.md },
    pageTitle: { ...TYPE.display, color: colors.textPrimary, marginBottom: SPACING.xxs },
    pageSubtitle: { ...TYPE.body, color: colors.textSecondary, marginBottom: SPACING.lg, lineHeight: 19 },

    label: { ...TYPE.subheadStrong, color: colors.textPrimary, marginBottom: SPACING.xs, marginTop: SPACING.sm },

    locationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      backgroundColor: colors.primaryGreenLight,
      borderWidth: 1,
      borderColor: '#BBF7D0',
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    locationBody: { flex: 1 },
    locationLabel: { ...TYPE.subheadStrong, color: colors.textPrimary },
    locationAccuracy: { ...TYPE.caption, color: colors.textSecondary, marginTop: 1 },
    locationText: { ...TYPE.body, color: colors.textSecondary, flex: 1 },

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

    helpWindowCaption: { ...TYPE.caption, color: colors.textSecondary, marginBottom: SPACING.xs, marginTop: -SPACING.xxs },
    helpWindowBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.bgElevated,
    },
    helpWindowText: { ...TYPE.body, color: colors.textSecondary, lineHeight: 18 },

    // Expiry hour selector
    expiryChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACING.xs },
    expiryChip: {
      paddingHorizontal: SPACING.sm,
      height: 36,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expiryChipActive: {
      borderColor: colors.primaryGreen,
      backgroundColor: colors.primaryGreenLight,
    },
    expiryChipText: { ...TYPE.footnote, fontWeight: '700', color: colors.textSecondary },
    expiryChipTextActive: { color: colors.primaryGreen },
    expiryInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
      padding: SPACING.sm,
      backgroundColor: colors.bgElevated,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    expiryInputLabel: { ...TYPE.footnote, color: colors.textSecondary, flex: 1 },
    expiryInput: {
      width: 60,
      height: 36,
      borderWidth: 1.5,
      borderColor: colors.primaryGreen,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bg,
      textAlign: 'center',
      ...TYPE.bodyStrong,
      color: colors.primaryGreen,
    },
    expiryUnit: { ...TYPE.footnote, color: colors.textSecondary },

    sectionTitle: { ...TYPE.subheadStrong, color: colors.textPrimary, marginTop: SPACING.lg, marginBottom: SPACING.xs },

    toggleCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    toggleBody: { flex: 1 },
    toggleLabel: { ...TYPE.bodyStrong, color: colors.textPrimary },
    toggleSub: { ...TYPE.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: SPACING.md },

    confirmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.lg,
      paddingHorizontal: 4,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    checkboxChecked: {
      backgroundColor: colors.primaryGreen,
      borderColor: colors.primaryGreen,
    },
    checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    confirmText: { ...TYPE.footnote, color: colors.textPrimary, flex: 1 },
  });
