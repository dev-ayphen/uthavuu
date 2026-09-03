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
import { useTranslation } from 'react-i18next';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import Spinner from '@uthavu/libs-mobile/components/Spinner';
import { Divider, TextField } from '@uthavu/libs-mobile/components';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import type { ReportCategory } from '@uthavu/libs-mobile/api/reports';
import { formatExpiryMinutes } from '../reportDraft';

// Presets are filtered against the chosen category's ceiling at render time,
// so this is the menu of candidates, not the menu shown.
const EXPIRY_PRESET_HOURS = [1, 2, 4, 6, 12, 24];

// The manual field's fallback cap when no category is chosen yet. Matches the
// value the field has always used; the category ceiling replaces it as soon as
// there is one.
const EXPIRY_HOURS_CAP_WITHOUT_CATEGORY = 720;

type Props = {
  locating: boolean;
  locationLabel: string;
  landmark: string;
  anonymous: boolean;
  // GET /config's allowAnonymousReports. When the platform has anonymous
  // posting switched off, the toggle isn't shown at all rather than shown
  // disabled — a switch that can't do anything is the exact problem
  // docs/webadmin/07-platform-settings.md §5A.3 is about.
  allowAnonymous: boolean;
  phoneVisible: boolean;
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
  allowAnonymous,
  phoneVisible,
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
  const { t } = useTranslation('report');
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The largest value the server will actually honour for this category. Whole
  // hours, and never below 1 — a category with a sub-hour default still has to
  // offer something selectable.
  const maxExpiryHours = category
    ? Math.max(1, Math.floor(category.defaultExpiryMinutes / 60))
    : EXPIRY_HOURS_CAP_WITHOUT_CATEGORY;

  return (
    <View style={styles.root}>
      {/* ── Page heading ── */}
      <Text style={styles.pageTitle}>{t('locationStep.pageTitle')}</Text>
      <Text style={styles.pageSubtitle}>{t('locationStep.pageSubtitle')}</Text>

      {/* ── Location ── */}
      <Text style={styles.label}>{t('locationStep.locationLabel')}</Text>
      <View style={styles.locationCard}>
        {locating ? (
          <>
            <Spinner variant="standalone" size="small" />
            <Text style={styles.locationText}>{t('locationStep.detecting')}</Text>
          </>
        ) : (
          <>
            <MapPin size={ICON_SIZE.sm} color={colors.primaryGreen} />
            <View style={styles.locationBody}>
              <Text style={styles.locationLabel} numberOfLines={1}>
                {locationLabel || t('locationStep.unavailable')}
              </Text>
            </View>
          </>
        )}
      </View>

      <TextField
        size="form"
        value={landmark}
        onChangeText={onChangeLandmark}
        placeholder={t('locationStep.landmarkPlaceholder')}
        autoCapitalize="sentences"
      />

      {/* ── Expected help window ── */}
      <Text style={styles.label}>{t('locationStep.expiryLabel')}</Text>
      <Text style={styles.helpWindowCaption}>
        {category
          ? t('locationStep.expiryDefault', { duration: formatExpiryMinutes(category.defaultExpiryMinutes) })
          : t('locationStep.expiryNoCategory')}
      </Text>

      {/*
       * The server applies Math.min(expiryMinutes, category.defaultExpiryMinutes)
       * — expiry may only SHORTEN the category default, never extend it
       * (reports.service.ts). The UI used to ignore that: presets went to 24h
       * and the manual field accepted 720 with a placeholder reading "e.g. 48",
       * so a reporter on a 6-hour category could ask for 48 and be silently
       * given 6, with no error and nothing to tell them it had happened.
       *
       * Offering only what the server will honour is better than validating
       * after the fact: there is no rejection to explain if the value can't be
       * entered. With no category chosen yet there is no ceiling to apply, so
       * the old 720-hour cap stands until one is.
       */}
      <View style={styles.expiryChipRow}>
        {EXPIRY_PRESET_HOURS.filter((h) => h <= maxExpiryHours).map((h) => {
          const active = customExpiryHours === h;
          return (
            <TouchableOpacity
              key={h}
              style={[styles.expiryChip, active && styles.expiryChipActive]}
              onPress={() => onChangeCustomExpiryHours(active ? null : h)}
            >
              <Text style={[styles.expiryChipText, active && styles.expiryChipTextActive]}>
                {t('locationStep.expiryPreset', { hours: h })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Manual hour entry */}
      <View style={styles.expiryInputRow}>
        <Text style={styles.expiryInputLabel}>{t('locationStep.expiryManualLabel')}</Text>
        <TextInput
          style={styles.expiryInput}
          value={customExpiryHours != null ? String(customExpiryHours) : ''}
          onChangeText={(v) => {
            const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
            onChangeCustomExpiryHours(isNaN(num) ? null : Math.max(1, Math.min(maxExpiryHours, num)));
          }}
          keyboardType="number-pad"
          maxLength={3}
          placeholder={t('locationStep.expiryManualPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
        />
        <Text style={styles.expiryUnit}>{t('locationStep.expiryUnit')}</Text>
      </View>
      {category && (
        <Text style={styles.expiryMaxHint}>
          {t('locationStep.expiryMaxHint', { hours: maxExpiryHours })}
        </Text>
      )}

      {/* ── Privacy & Notifications ── */}
      <Text style={styles.sectionTitle}>{t('locationStep.privacyTitle')}</Text>

      <View style={styles.toggleCard}>
        {/* Post Anonymously — only when the platform allows it */}
        {allowAnonymous && (
          <>
            <View style={styles.toggleRow}>
              <View style={styles.toggleBody}>
                <Text style={styles.toggleLabel}>{t('locationStep.anonymousLabel')}</Text>
              </View>
              <Switch
                value={anonymous}
                onValueChange={onToggleAnonymous}
                trackColor={{ false: colors.border, true: colors.primaryGreen }}
                thumbColor="#FFFFFF"
              />
            </View>

            <Divider inset={SPACING.md} />
          </>
        )}

        {/* Share phone number */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={styles.toggleLabel}>{t('locationStep.phoneVisibleLabel')}</Text>
            <Text style={styles.toggleSub}>
              {phoneVisible
                ? t('locationStep.phoneVisibleOn')
                : t('locationStep.phoneVisibleOff')}
            </Text>
          </View>
          <Switch
            value={phoneVisible}
            onValueChange={onTogglePhoneVisible}
            trackColor={{ false: colors.border, true: colors.primaryGreen }}
            thumbColor="#FFFFFF"
          />
        </View>


        {/*
         * NO "Share with local NGOs" TOGGLE. One used to sit here with
         * `onValueChange={() => {}}` and a hardwired `false`, so it could not
         * be moved and nothing was ever sent — there is no NGO field in
         * CreateReportInput, no column, and no endpoint. It was a
         * privacy-shaped control that did nothing, which is precisely what the
         * comment on `allowAnonymous` above forbids: a switch that can't do
         * anything is worse than an absent one, because a reporter deciding
         * what to disclose reads it as a setting they have chosen.
         *
         * Bring it back with the feature, not before.
         */}
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
        <Text style={styles.confirmText}>{t('locationStep.confirmLabel')}</Text>
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
    locationText: { ...TYPE.body, color: colors.textSecondary, flex: 1 },

    helpWindowCaption: { ...TYPE.caption, color: colors.textSecondary, marginBottom: SPACING.xs, marginTop: -SPACING.xxs },

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
    expiryMaxHint: { ...TYPE.caption, color: colors.textSecondary, marginTop: SPACING.xs },

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
