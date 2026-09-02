import {
  BadgeCheck,
  Ban,
  ExternalLink,
  Info,
  LayoutTemplate,
  Route as RouteIcon,
  Terminal,
} from "lucide-react";

import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import {
  ADMOB_CONSOLE_URL,
  ADMOB_FACTS_VERIFIED_ON,
  ADMOB_IS_INTEGRATED,
  ADMOB_MONEY_PATH,
  ADMOB_PERSISTENCE_REQUIREMENTS,
  ADMOB_PREREQUISITES,
} from "./admob-integration";

/**
 * Google AdMob — an INTEGRATION STATUS PAGE, not a revenue dashboard.
 *
 * WHAT THIS PAGE REFUSES TO BE
 * ───────────────────────────────────────────────────────────────────────────
 * `docs/webadmin/08-monetization.md` §0.2 and §2 describe what stood here
 * before: four earnings cards (Today / This Month / Last Month / All Time), a
 * config table printing app ids, a Test Mode switch, and six ad placements each
 * with an enable toggle and a Save button. §2.2 records that every one of those
 * unit ids began `ca-app-pub-3940256099942544` — Google's public SAMPLE
 * publisher id, documented for development only, which serves test ads and
 * earns nothing. §2.3 records that both Save buttons were `alert()` calls.
 *
 * Together with §4.1 — "revenue reporting is fictional twice over" — that is a
 * screen where the numbers were invented, the inventory was fake, and the
 * controls did nothing. Three separate ways of being wrong, on one page,
 * arranged to look like a dashboard.
 *
 * SO THIS PAGE HAS NO NUMBERS AND NO SWITCHES.
 *
 * No earnings, no eCPM, no impressions, no fill rate — this product has never
 * served an ad, so every one of those would be a figure with no origin. No ad
 * unit ids, because the only ones this repository has ever seen were Google's
 * test ids, and a table of them reads as live inventory. And no toggles: the
 * platform-settings post-mortem next door (`07-platform-settings.md` §2A) counts
 * eleven switches with no handler and names the lesson — "a switch that looks
 * like a stop button and isn't one is worse than no switch." A control that
 * persists nothing is not a placeholder for a control; it is a false statement
 * about the system.
 *
 * What is left is the truth, which turns out to be the useful part: where the
 * money actually comes from, what is missing before a single figure could
 * appear here, and a link to the console where the earnings really live.
 */
export function AdmobStatus() {
  return (
    <div className="space-y-6">
      <StatusStrip />
      <MoneyPath />
      <Prerequisites />
      <Placements />
    </div>
  );
}

/* ---------------------------------------------------------------------- head */

/**
 * The headline status — derived from the prerequisite list, never written by
 * hand, so it cannot say "integrated" while the checks below say otherwise.
 */
function StatusStrip() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge tone={ADMOB_IS_INTEGRATED ? "success" : "neutral"} className="px-2.5 py-1 text-[11px]">
        {ADMOB_IS_INTEGRATED ? (
          <BadgeCheck className="size-3" aria-hidden />
        ) : (
          <Ban className="size-3" aria-hidden />
        )}
        {ADMOB_IS_INTEGRATED ? "Integrated" : "Not integrated"}
      </Badge>
      <span className="text-[11px] text-fg-faint">
        {/*
          Said out loud because it is the difference between this page and a
          green light wired to nothing: nothing here probed anything just now.
          These are facts a person checked against the repository, with the
          commands that re-check them listed below.
        */}
        Checked against the repository on{" "}
        <span className="tabular text-fg-muted">{ADMOB_FACTS_VERIFIED_ON}</span> — a recorded check,
        not a live probe
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- money path */

function MoneyPath() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <RouteIcon className="size-4 text-primary" aria-hidden />
          How AdMob money actually works
        </CardTitle>
      </CardHeader>
      <CardBody>
        <ol className="space-y-3">
          {ADMOB_MONEY_PATH.map((step, index) => {
            const isConsole = step.actor === "This console";
            return (
              <li key={step.text} className="flex gap-3">
                <span
                  aria-hidden
                  className={
                    isConsole
                      ? "flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary-soft text-[11px] font-bold text-primary-soft-fg"
                      : "flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-3 text-[11px] font-bold text-fg-muted"
                  }
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <span className="micro-label">{step.actor}</span>
                  <p className={isConsole ? "mt-0.5 text-fg" : "mt-0.5 text-fg-subtle"}>
                    {step.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button variant="secondary" size="sm" asChild>
            {/*
              A link out, not an embed. The earnings live in Google's console and
              this one has no way to mirror them; pretending otherwise is how the
              previous version ended up showing four earnings cards it made up.
            */}
            <a href={ADMOB_CONSOLE_URL} target="_blank" rel="noreferrer noopener">
              <ExternalLink />
              Open the AdMob dashboard
            </a>
          </Button>
          <span className="text-[11px] text-fg-faint">
            apps.admob.com — the only place Uthavu&apos;s ad earnings exist
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------- prerequisites */

function Prerequisites() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Info className="size-4 text-primary" aria-hidden />
          What is in place today
        </CardTitle>
        <Badge tone="neutral">
          {ADMOB_PREREQUISITES.filter((item) => item.present).length} of{" "}
          {ADMOB_PREREQUISITES.length}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="max-w-3xl text-fg-subtle">
          All three must be true before this console could display a single AdMob figure — and each
          is false for its own reason, so they are listed separately rather than collapsed into one
          &ldquo;not set up&rdquo; line.
        </p>

        <div className="grid gap-3 lg:grid-cols-3">
          {ADMOB_PREREQUISITES.map((item) => (
            <div key={item.label} className="rounded-control border border-border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold text-fg">{item.label}</span>
                <Badge tone={item.present ? "success" : "neutral"}>
                  {item.present ? "In place" : "Missing"}
                </Badge>
              </div>
              <p className="mt-1.5 text-[11px] text-fg-faint">{item.detail}</p>
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-fg-faint">
                <Terminal className="mt-0.5 size-3 shrink-0" aria-hidden />
                {/*
                  The command is printed so the claim is falsifiable in ten
                  seconds. A status page nobody can check is a status page
                  nobody should believe.
                */}
                <code className="rounded bg-surface-3 px-1 py-0.5 font-mono break-all text-fg-muted">
                  {item.check}
                </code>
              </p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------- placements */

function Placements() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <LayoutTemplate className="size-4 text-fg-faint" aria-hidden />
          Ad placements and formats
        </CardTitle>
        <Badge tone="neutral">Not configurable yet</Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="max-w-3xl text-fg-subtle">
          There are no placement switches on this page, and that is deliberate. The version this
          replaces had six — each with an enable toggle whose state came from an array index, and a
          Save button that showed an alert and wrote nothing. Refreshing the page undid every
          change, silently.
        </p>
        <p className="max-w-3xl text-fg-subtle">
          Nothing is offered here until switching it can actually change what a citizen sees. Until
          the mobile app has an ad SDK, an enabled placement and a disabled one produce identical
          behaviour: nothing renders either way.
        </p>

        <div className="rounded-control border border-border bg-surface-2 p-3">
          <h3 className="micro-label">What making these real would need</h3>
          <ul className="mt-2 space-y-2">
            {ADMOB_PERSISTENCE_REQUIREMENTS.map((requirement) => (
              <li key={requirement} className="flex gap-2 text-[11px] text-fg-subtle">
                <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-pill bg-fg-faint" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-fg-faint">
            Written down rather than done. No table was invented and no migration was generated for
            this page: migration 0022 belongs to the sponsors module, and inventing a schema for a
            setting nothing can read yet is how a console fills up with controls that do nothing.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
