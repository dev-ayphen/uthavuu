import { useCallback, useMemo } from 'react';
import {
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import type { AdPlacement } from '@uthavu/libs-mobile/api/ads';
import { useAds } from '../hooks/useAds';

type Props = {
  placement: AdPlacement;
  /** Only meaningful for CATEGORY_LIST — scopes the ad to the category on screen. */
  category?: string;
  /**
   * Outer spacing, supplied by the screen. Deliberately has no default: in a
   * FlatList the contentContainer's own `gap` already spaces this correctly,
   * and a built-in margin would double it. A screen inside a plain ScrollView
   * passes a token-based margin instead.
   */
  style?: StyleProp<ViewStyle>;
};



/**
 * Creative height. Not a token because the theme has no image-height scale —
 * screens size their own imagery (MyImpactStoriesScreen's 72pt thumbnail, for
 * one). Named here rather than inlined so there is one place to change it.
 */
const CREATIVE_HEIGHT = 140;

/**
 * One sponsor ad slot. `<SponsorAd placement="home" />` is the entire API.
 *
 * IT RENDERS NOTHING unless the backend hands it a campaign. Loading renders
 * nothing (no skeleton — a skeleton is a promise that something is coming, and
 * for an ad that is a promise this component cannot keep). An error renders
 * nothing and is never surfaced to the citizen. No campaign renders nothing —
 * not an empty container, not a placeholder, not a fallback sponsor. Rendering
 * nothing is the correct and expected state for most placements most of the
 * time.
 *
 * IT MUST NOT LOOK LIKE A HELP REQUEST. This is a safety rule, not styling:
 * Uthavu users scan these screens for emergencies, and an ad that reads like
 * one is genuinely dangerous. Hence, in the styles below — no emoji, no
 * urgency/status colouring, no category badge, no red/amber/green accent, and
 * an unmissable "Sponsored" label above everything else. If you are tempted to
 * make this card more eye-catching, that is the temptation this comment exists
 * to stop.
 *
 * IT MUST NEVER BLOCK ANYTHING. No modal, no interstitial, no gate. It draws
 * beside content and nothing waits on it.
 */
export default function SponsorAd({ placement, category, style }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation('sponsor');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { campaign, isLoading, isError } = useAds(placement, category);


  const targetUrl = campaign?.targetUrl ?? null;

  const onPress = useCallback(() => {
    if (!campaign || !targetUrl) return;

    // No click tracking: the routes do not exist and the product owner decided
    // on 2026-09-02 not to build them yet. Opening the URL is the whole action.
    Linking.openURL(targetUrl).catch(() => {
      // A URL the OS can't open is the sponsor's data problem, not something to
      // interrupt a citizen with.
    });
  }, [campaign, targetUrl]);

  // The three "render nothing" cases, in order. Note there is no branch that
  // renders a container, a skeleton or a fallback — every path out of here is
  // either a real campaign or null.
  if (isLoading || isError || !campaign) return null;

  // `video` renders its poster frame and nothing else. There is no play button
  // and no modal: apps/mobile has no video dependency, and a play affordance
  // that opens a fake player is exactly what commit b4c0daf deleted. The
  // creative is imagery; the CTA is the only action.
  const creativeUri =
    campaign.creativeType === 'banner'
      ? (campaign.creativeUrl ?? campaign.thumbnailUrl)
      : campaign.creativeType === 'video'
        ? campaign.thumbnailUrl
        : null;

  const pressable = targetUrl !== null;

  return (
    <View style={style}>
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        disabled={!pressable}
        activeOpacity={0.85}
        accessibilityRole={pressable ? 'link' : undefined}
        accessibilityLabel={t('cardLabel', { sponsor: campaign.sponsorName })}
      >
        {/* Always first, always present. The label is the point of the card. */}
        <View style={styles.labelRow}>
          <Text style={styles.sponsoredLabel}>{t('sponsored')}</Text>
        </View>

        {creativeUri ? (
          <Image
            source={{ uri: creativeUri }}
            style={styles.creative}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <View style={styles.brandRow}>
          {campaign.logoUrl ? (
            <Image
              source={{ uri: campaign.logoUrl }}
              style={styles.logo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <Text style={styles.sponsorName} numberOfLines={1}>
            {campaign.sponsorName}
          </Text>
        </View>

        {campaign.headline ? (
          <Text style={styles.headline} numberOfLines={2}>
            {campaign.headline}
          </Text>
        ) : null}

        {campaign.body ? (
          <Text style={styles.body} numberOfLines={3}>
            {campaign.body}
          </Text>
        ) : null}

        {pressable ? (
          <Text style={styles.cta}>{campaign.ctaText ?? t('defaultCta')}</Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    // Every colour here is a neutral from the theme. There is intentionally no
    // primaryGreen, no danger and no TONES entry anywhere in this stylesheet:
    // those are the app's language for "this is a real request and it matters",
    // and an advertisement must never borrow it.
    card: {
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xxl,
      padding: SPACING.md,
      gap: SPACING.xs,
    },
    labelRow: { flexDirection: 'row' },
    sponsoredLabel: {
      ...TYPE.microLabel,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.sm,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xxs,
      overflow: 'hidden',
    },
    creative: {
      width: '100%',
      height: CREATIVE_HEIGHT,
      borderRadius: RADIUS.lg,
      backgroundColor: colors.border,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    logo: { width: ICON_SIZE.lg, height: ICON_SIZE.lg, borderRadius: RADIUS.sm },
    sponsorName: { ...TYPE.footnote, color: colors.textSecondary, flexShrink: 1 },
    headline: { ...TYPE.bodyStrong, color: colors.textPrimary },
    body: { ...TYPE.footnoteRegular, color: colors.textSecondary },
    // Underlined rather than tinted, for the same reason as the palette above:
    // it reads as "this opens something external" instead of as one of the
    // app's own green call-to-action buttons.
    cta: {
      ...TYPE.footnote,
      color: colors.textPrimary,
      textDecorationLine: 'underline',
      marginTop: SPACING.xxs,
    },
  });
