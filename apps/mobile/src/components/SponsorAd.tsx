import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { ColorScheme } from '@uthavu/libs-mobile/theme/colors';
import { useTheme } from '@uthavu/libs-mobile/theme/ThemeProvider';
import { ICON_SIZE, RADIUS, SPACING, TYPE } from '@uthavu/libs-mobile/theme/tokens';
import {
  trackAdClick,
  trackAdImpression,
  type AdPlacement,
} from '@uthavu/libs-mobile/api/ads';
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
 * How much of the card must be inside the window before it counts as seen.
 * Half is the common industry floor (IAB's display standard is 50% of pixels);
 * anything lower starts counting cards that are one pixel past the fold.
 */
const VISIBLE_AREA_RATIO = 0.5;

/**
 * How often to re-measure while the card has not yet been counted. See the
 * long note on the effect below for why this is a poll and why it costs almost
 * nothing.
 */
const VISIBILITY_POLL_MS = 500;

/**
 * Creative height. Not a token because the theme has no image-height scale —
 * screens size their own imagery (MyImpactStoriesScreen's 72pt thumbnail, for
 * one). Named here rather than inlined so there is one place to change it.
 */
const CREATIVE_HEIGHT = 140;

/**
 * One sponsor ad slot. `<SponsorAd placement="HOME_FEED" />` is the entire API.
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
  const isFocused = useIsFocused();

  const containerRef = useRef<View | null>(null);

  /**
   * THE DUPLICATE GUARD. Holds the id of the campaign an impression has already
   * been sent for, so a re-render, a refetch that returns the same campaign, or
   * the user scrolling the card off and back on cannot count it twice.
   *
   * Keyed by campaign id rather than a boolean on purpose: if a refetch returns
   * a *different* campaign into this same slot, that genuinely is a new
   * impression and should be counted. A boolean would silently swallow it.
   *
   * Being a ref (not state) is also load-bearing — writing it must not trigger
   * a render, or recording an impression would itself cause the re-render that
   * a naive implementation then miscounts.
   */
  const recordedCampaignIdRef = useRef<string | null>(null);

  const campaignId = campaign?.id ?? null;

  /**
   * THE VISIBILITY TEST. Measures where the card actually is on the physical
   * screen and counts an impression only if at least half of it is inside the
   * window.
   *
   * This is the part that must not be a bare `useEffect(() => POST…)`. Firing
   * because the API returned a campaign counts ads that were never on screen —
   * below the fold in a ScrollView, off the end of a FlatList, on a screen
   * buried in the navigation stack — and inflates the number a sponsor is
   * eventually shown.
   *
   * `measureInWindow` is used rather than FlatList's `onViewableItemsChanged`
   * because it works identically in every host: a ScrollView (Home feed), a
   * FlatList footer (Category list, Impact Stories), or a plain View. Tying
   * this to viewability config would mean each screen wiring up a different
   * mechanism and the component no longer owning its own correctness.
   */
  const recordImpressionIfVisible = useCallback(() => {
    const node = containerRef.current;
    if (!node || !campaignId) return;
    if (recordedCampaignIdRef.current === campaignId) return;

    node.measureInWindow((x, y, width, height) => {
      // Re-checked inside the callback, not just outside it: measureInWindow is
      // asynchronous, so several measurements can be in flight at once. JS is
      // single-threaded and the ref is claimed synchronously below, so whichever
      // callback arrives first wins and the rest return here.
      if (recordedCampaignIdRef.current === campaignId) return;
      if (width <= 0 || height <= 0) return;

      const window = Dimensions.get('window');
      const visibleWidth = Math.min(x + width, window.width) - Math.max(x, 0);
      const visibleHeight = Math.min(y + height, window.height) - Math.max(y, 0);
      if (visibleWidth <= 0 || visibleHeight <= 0) return;
      if ((visibleWidth * visibleHeight) / (width * height) < VISIBLE_AREA_RATIO) return;

      // Claimed BEFORE the request is dispatched, never after and never in a
      // `.then()`. If this were set on success, every measurement that landed
      // while the POST was in flight would fire its own POST.
      recordedCampaignIdRef.current = campaignId;
      trackAdImpression(campaignId);
    });
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId || !isFocused) return;
    if (recordedCampaignIdRef.current === campaignId) return;

    // Measure once immediately — covers the common case where the card is
    // already on screen the moment it mounts.
    recordImpressionIfVisible();

    // Then poll until it becomes visible, and stop permanently the instant it
    // does. This is bounded in the way that matters: the interval clears itself
    // on the first successful count, and `isFocused` tears it down entirely
    // when the screen is pushed behind another one. What is left is a single
    // native view measurement twice a second, only while a real campaign is
    // loaded, only while the user is looking at this screen, and only until the
    // card has been seen once — which is cheaper than the re-render it avoids.
    const interval = setInterval(() => {
      if (recordedCampaignIdRef.current === campaignId) {
        clearInterval(interval);
        return;
      }
      recordImpressionIfVisible();
    }, VISIBILITY_POLL_MS);

    return () => clearInterval(interval);
  }, [campaignId, isFocused, recordImpressionIfVisible]);

  const targetUrl = campaign?.targetUrl ?? null;

  const onPress = useCallback(() => {
    if (!campaign || !targetUrl) return;

    // Click first, then navigate — and deliberately NOT awaited. `trackAdClick`
    // returns void precisely so this cannot be written as
    // `await trackAdClick(...)`, which would turn a tracking outage or a slow
    // network into a button that does nothing.
    trackAdClick(campaign.id);
    Linking.openURL(targetUrl).catch(() => {
      // A URL the OS can't open is the sponsor's data problem, not something to
      // interrupt a citizen with. The click is already recorded.
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
    // The measured node is this outer View, not the touchable inside it.
    // `collapsable={false}` is required: without it Android may flatten a plain
    // View out of the native hierarchy entirely, and measureInWindow then
    // reports zeros forever — the card would render and never count.
    <View ref={containerRef} onLayout={recordImpressionIfVisible} collapsable={false} style={style}>
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
