"use client";

import {
  ArrowRight,
  CalendarClock,
  Eye,
  Hourglass,
  IndianRupee,
  Megaphone,
  MousePointerClick,
  PauseCircle,
  PencilLine,
  Percent,
  Radio,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ListFailureState, classifyListFailure } from "@/components/data";
import { Button, MetricTile, Skeleton, StatCard, type Accent } from "@/components/ui";
import { formatFigure } from "@/features/analytics/use-analytics";
import { NotAvailableCard } from "./not-available-card";
import {
  SPONSOR_CAMPAIGN_STATUSES,
  SPONSOR_DELIVERY_UNMEASURED,
  useSponsorCampaignCounts,
  type SponsorCampaignStatusKey,
} from "./use-sponsor-campaign-counts";

/**
 * Monetization Overview — the two revenue lines, kept apart.
 *
 * THE ONE RULE THIS SCREEN IS BUILT AROUND
 * ───────────────────────────────────────────────────────────────────────────
 * Never display a number the system cannot actually produce.
 * `docs/webadmin/08-monetization.md` §4.1 is the post-mortem of this exact
 * page. The prototype's overview stacked Total Revenue, AdMob Earnings, Sponsor
 * Revenue, impressions, clicks, CTR, estimated revenue and eCPM — eight
 * figures, not one of which anything measured. §4.1's verdict is that the
 * reporting was "fictional twice over": the mobile app reported no impressions,
 * so the delivery counts could never move, and the ad units were Google's
 * public test ids, which earn nothing even when they serve.
 *
 * So this rebuild shows exactly three kinds of thing, and nothing else:
 *
 *   a count of rows      the database computed it (`pagination.total`)
 *   an em dash           the shape exists; nothing measures it yet
 *   a stated absence     there is no source at all, said in words
 *
 * WHY THERE IS NO "TOTAL REVENUE"
 * ───────────────────────────────────────────────────────────────────────────
 * A total is a claim that both halves are real and comparable. Neither half is.
 * Sponsor money is a fixed fee or an agreed CPM negotiated offline — this
 * system holds no contract value, no invoice and no payment, and
 * `sponsors-schema.ts` carries no amount column by design. AdMob money is
 * Google's: measured by Google, paid by Google, and nothing here is connected
 * to it. Adding two unknowns produces a third, more confident-looking unknown,
 * and it is the one an operator would quote in a meeting.
 *
 * WHAT IS FETCHED AND WHAT IS SIMPLY TRUE
 * ───────────────────────────────────────────────────────────────────────────
 * Only the campaign counts are fetched. The revenue card, the delivery tiles
 * and the whole AdMob section are stated facts about this codebase, so they
 * render whether or not `/admin/sponsors` answers. A failed request must not be
 * able to hide the parts of the page that never depended on it.
 */
export function MonetizationOverview() {
  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-fg-subtle">
        Uthavu has two revenue lines and they are measured in different places, so this page keeps
        them apart and never adds them into one total. Sponsor campaigns are managed here; AdMob
        earnings are measured and paid by Google.
      </p>

      <SponsorSection />
      <AdmobSection />
    </div>
  );
}

/* ------------------------------------------------------------------ sponsors */

const STATUS_STYLE: Record<SponsorCampaignStatusKey, { icon: LucideIcon; accent: Accent }> = {
  active: { icon: Radio, accent: "emerald" },
  scheduled: { icon: CalendarClock, accent: "violet" },
  paused: { icon: PauseCircle, accent: "amber" },
  expired: { icon: Hourglass, accent: "slate" },
  draft: { icon: PencilLine, accent: "blue" },
};

function SponsorSection() {
  const { data, isPending, isError, error, refetch } = useSponsorCampaignCounts();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="micro-label">Sponsor campaigns</h2>
          <p className="mt-0.5 text-fg-subtle">
            Counted from the sponsors table. Every number in this section is a number of rows.
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/monetization/sponsors">
            Manage campaigns
            <ArrowRight />
          </Link>
        </Button>
      </div>

      {/*
        BRANCH ORDER IS LOAD-BEARING: loading -> error -> content. Checking for
        an empty result before `isError` would render "no campaigns" when the
        request actually failed, telling an operator their campaigns are gone
        when it is the endpoint that is gone.

        There is deliberately no empty branch at all. Zero campaigns is a real,
        correct count that the database returned, so the tiles show `0` — the
        one place on this page where a zero is the honest answer, because
        something actually counted.
      */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isPending ? (
          <>
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
          </>
        ) : isError ? (
          // Spans the two StatCard slots it replaces, so the revenue card keeps
          // its place in the row instead of jumping a column.
          <div className="sm:col-span-2">
            <ListFailureState failure={classifyListFailure(error)} onRetry={() => void refetch()} />
          </div>
        ) : (
          <>
            <StatCard
              label="Campaigns on file"
              value={formatFigure(data.total)}
              sublabel="Every campaign not deleted, in any status"
              icon={Megaphone}
              accent="blue"
            />
            <StatCard
              label="Live right now"
              value={formatFigure(data.byStatus.active)}
              sublabel="Inside its window and not paused — showing in the app"
              icon={Radio}
              accent="emerald"
            />
          </>
        )}

        {/*
          The revenue slot, rendered as what it is. Sponsor payment is a business
          agreement — a fixed fee, or a CPM written into a contract — and this
          system models neither. A rupee figure derived from campaign counts or
          impressions would be invented, which is precisely the failure §4.1
          documents. It sits in the same grid so the slot is visibly present and
          visibly unfilled, rather than quietly missing.
        */}
        <NotAvailableCard
          icon={IndianRupee}
          title="Sponsor revenue"
          status="Not configured"
          className="sm:col-span-2"
        >
          <p>
            What a sponsor pays is agreed offline — a fixed fee, or a CPM in a contract. This system
            stores no contract value, no invoice and no payment, so there is no rupee figure to show
            and none can be derived from the counts beside it.
          </p>
          <p>
            Showing a zero here would say the campaigns earned nothing. The truth is that this
            console has never been told what they are worth.
          </p>
        </NotAvailableCard>
      </div>

      {/*
        Dropped entirely on failure rather than left as skeletons. A skeleton
        says "this is arriving"; after a refusal or a 404 nothing is arriving,
        and an animation that implies otherwise is a small lie repeated forever.
        The failure above already said what happened, once.
      */}
      {isError ? null : (
        <div>
          <h3 className="micro-label mb-2">Every campaign, by status</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {SPONSOR_CAMPAIGN_STATUSES.map((status) => {
              const style = STATUS_STYLE[status.key];
              return isPending ? (
                <Skeleton key={status.key} className="h-[4.75rem] rounded-card" />
              ) : (
                <MetricTile
                  key={status.key}
                  label={status.label}
                  value={formatFigure(data.byStatus[status.key])}
                  icon={style.icon}
                  accent={style.accent}
                />
              );
            })}
          </div>
          <p className="mt-2 max-w-3xl text-[11px] text-fg-faint">
            Booked ahead and Ended are derived from the campaign window at read time and never
            stored, so a campaign whose end date passed an hour ago already counts as ended — no
            scheduled job had to run for that to be true.
          </p>
          {!isPending && data.unaccounted > 0 ? (
            <p className="mt-1 max-w-3xl text-[11px] text-warning-fg">
              {formatFigure(data.unaccounted)} campaigns are in a status this console has no tile
              for, so the five above do not add up to the total. The API has a status key newer than
              this build — the rows are counted, not lost.
            </p>
          ) : null}
        </div>
      )}

      <div>
        <h3 className="micro-label mb-2">Delivery</h3>
        <div className="grid grid-cols-3 gap-3 sm:max-w-lg">
          {/*
            Three em dashes, and they stay em dashes until something counts.
            Same reasoning as the dashboard's untracked counters: `0`
            impressions reads as "nobody saw the ads" — a campaign problem an
            operator takes to the sponsor. The truth is "nothing measures this",
            an engineering gap they escalate instead. Different problem,
            different person, so the two must not look alike.
          */}
          <MetricTile
            label="Impressions"
            value={formatFigure(SPONSOR_DELIVERY_UNMEASURED.impressions)}
            icon={Eye}
            accent="cyan"
          />
          <MetricTile
            label="Clicks"
            value={formatFigure(SPONSOR_DELIVERY_UNMEASURED.clicks)}
            icon={MousePointerClick}
            accent="pink"
          />
          <MetricTile
            label="CTR"
            value={formatFigure(SPONSOR_DELIVERY_UNMEASURED.ctr, "%")}
            icon={Percent}
            accent="violet"
          />
        </div>
        <p className="mt-2 max-w-3xl text-[11px] text-fg-faint">
          Not measured, so an em dash rather than a zero. The mobile app does not report when a
          sponsor card is shown or tapped, and there is no impression or click table behind these
          tiles. They fill in when the app starts reporting those events and the API starts counting
          them — nothing here will estimate them in the meantime.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- admob */

/**
 * The AdMob half — a stated absence, not a zero, and not a query.
 *
 * There is nothing to fetch: no ad SDK in the mobile app, no credentials in the
 * API's environment, no reporting connection to Google. Rendering `₹0` or
 * `0 impressions` here would be the same lie in a different font.
 */
function AdmobSection() {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="micro-label">Google AdMob</h2>
          <p className="mt-0.5 text-fg-subtle">
            Ads served by Google, measured by Google, paid by Google.
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/monetization/admob">
            Integration status
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <NotAvailableCard icon={Smartphone} title="AdMob earnings" status="Not connected">
        <p>
          There is no AdMob data source behind this console: the mobile app has no ad SDK, no AdMob
          credentials are configured, and nothing reads Google&apos;s reporting API. No ad has ever
          been served or counted for this product.
        </p>
        <p>
          So there is no zero to show. A zero would mean the ads earned nothing this month; the
          truth is that nothing is measuring them. And even once something is, the figures will be
          Google&apos;s — fetched and displayed. This backend will never calculate AdMob revenue.
        </p>
      </NotAvailableCard>
    </section>
  );
}
