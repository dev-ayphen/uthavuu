import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
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
            <ActivityIndicator size="small" color={colors.primaryGreen} />
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
      <Text style={styles.helpWindowCaption}>How long this request stays open to volunteers.</Text>
      <View style={styles.helpWindowBox}>
        <Text style={styles.helpWindowText}>
          {category
            ? `Open for ${formatExpiryMinutes(category.defaultExpiryMinutes)}`
            : "Pick a category first — it sets how long this request stays open."}
        </Text>
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
    confirmText: { ...TYPE.footnote, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  });
