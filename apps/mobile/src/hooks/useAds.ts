import { useQuery } from '@tanstack/react-query';
import {
  adQueryKey,
  getAd,
  type AdPlacement,
  type SponsorCampaign,
} from '@uthavu/libs-mobile/api/ads';

export type UseAdsResult = {
  /** The campaign to render, or `null` for "render nothing at all". */
  campaign: SponsorCampaign | null;
  isLoading: boolean;
  isError: boolean;
};

// The sponsor campaign for one placement, or nothing.
//
// Lives in apps/mobile rather than libs-mobile for the same reason useConfig
// does: @tanstack/react-query is a dependency of this app only —
// libs-mobile/package.json doesn't declare it, and pnpm links strictly, so a
// hook importing it from there wouldn't resolve. libs-mobile/api/ads.ts holds
// the transport and every shape decision; this is the React binding.
//
// Almost nobody should call this directly. SponsorAd owns the whole lifecycle
// — loading, error, empty and the visibility-gated impression — and a screen
// that reaches past it to this hook is a screen that can accidentally render an
// empty ad container, which is precisely the bug this feature exists to avoid.
export function useAds(placement: AdPlacement): UseAdsResult {
  const { data, isPending, isError } = useQuery({
    queryKey: adQueryKey(placement),
    queryFn: () => getAd(placement),

    // One minute. Short on purpose: the product promise is that pausing a
    // campaign in the admin console makes it vanish from the app with no
    // release, and a long staleTime is exactly what would break that promise —
    // a paused campaign would keep rendering from cache for as long as the
    // window lasts. A minute is long enough that bouncing between two tabs
    // doesn't re-hit the endpoint, and short enough that "paused" means paused.
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,

    // No retries, ever. An ad that fails to load is a non-event — it renders
    // nothing, which is the same thing it renders when there is genuinely no
    // campaign, so the user cannot tell the difference and there is nothing to
    // recover. Retrying would spend a citizen's battery and mobile data
    // re-asking for an advertisement on a flaky connection, which is indefensible
    // in an emergency app.
    retry: false,

    // Refetching on focus would restart the impression race for a campaign the
    // user has already been counted for, for no benefit — the staleTime above
    // already covers "has this campaign been pulled?".
    refetchOnWindowFocus: false,
  });

  return {
    // `?? null` rather than passing `data` through: getAd resolves to
    // `SponsorCampaign | null`, but react-query uses `undefined` for "no data
    // yet". Collapsing both to null here means the component has exactly one
    // empty case to handle instead of two that mean the same thing.
    campaign: data ?? null,
    isLoading: isPending,
    isError,
  };
}
