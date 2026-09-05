// Runs the Maestro suite with its fixtures already in place.
//
// Seeds the reports flows 03 and 04 expect to find already published (see
// seed-fixture.mjs for why that whole job cannot happen inside a Maestro
// script), then hands their ids and titles to the flows. Without this step
// `utils/seed-report.js` has nothing to report and every seeded flow fails on a
// message that points at the wrong screen.
//
// ⚠️ ONE REPORT PER CONSUMING FLOW, NOT ONE FOR THE SUITE. A report defaults to
// `neededVolunteers: 1`, so the first volunteer to accept it fills it —
// MissionsService.accept() then refuses everyone else with "Volunteer limit
// reached". 03 accepts its report through the UI and 04 accepts its own over
// HTTP, so sharing a single seeded report would leave 04 failing on a report 03
// had already consumed. They get one each.
//
// Everything after `--` is passed through to Maestro, so this stays a thin
// wrapper rather than a second place that knows about flow paths:
//
//   node .maestro/scripts/run-e2e.mjs                    # whole suite
//   node .maestro/scripts/run-e2e.mjs -- flows/01-otp-login.yaml
//
// EXPO_DEV_URL is required and deliberately has no default — the port changes
// per machine and per `expo start`, and silently testing a different project's
// bundle is worse than failing loudly.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { seedOpenReport } from './seed-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const maestroDir = resolve(here, '..');

/**
 * Which flow gets which seeded report.
 *
 * `prefix` is what the `-e` variables are named after: `SEED_REPORT` becomes
 * `SEED_REPORT_ID` + `SEED_REPORT_TITLE`. Each flow maps the pair it owns onto
 * `SEED_REPORT_ID` / `SEED_REPORT_TITLE` in its own `runScript:` env block, so
 * `utils/seed-report.js` reads one fixed pair of names no matter which flow
 * called it.
 *
 * ⚠️ THE LABELS ARE MULTI-WORD, AND THAT IS SAFE — DO NOT HYPHENATE THEM.
 * `spawn` is called without a shell, so each `-e NAME=value` reaches Maestro as
 * one argv entry with nothing in between to word-split it, and Maestro's own
 * `${...}` substitution then hands the value on verbatim. Measured on Maestro
 * 2.9.0 with a probe flow that echoed the received value back: spaces, tabs,
 * `=`, single and double quotes, commas and non-ASCII all arrive intact, and
 * surrounding whitespace is not trimmed. See README § "Multi-word seeded
 * titles". Hyphenating these labels would buy nothing and would stop the
 * fixture resembling a real report title, which is the thing 03 and 04 type
 * into the search box.
 *
 * Maestro takes `-e` variables once, for the whole invocation, so there is no
 * way to seed these lazily per flow — every consumer's report is seeded up
 * front, including for a single-flow run that will not use them. Two extra HTTP
 * seeds is a cheaper price than a second mechanism.
 */
const SEEDED_REPORTS = [
  { prefix: 'SEED_REPORT', label: 'Maestro accept test' }, // flows/03
  { prefix: 'SEED_REPORT_2', label: 'Maestro complete test' }, // flows/04
];

const expoDevUrl = process.env.EXPO_DEV_URL;
if (!expoDevUrl) {
  process.stderr.write(
    '\n[run-e2e] EXPO_DEV_URL is not set.\n' +
      '          Start Metro (pnpm --filter mobile dev), note the exp:// URL it prints,\n' +
      '          then re-run with e.g. EXPO_DEV_URL=exp://127.0.0.1:8081\n\n',
  );
  process.exit(1);
}

const passthrough = process.argv.slice(2);
const dashDash = passthrough.indexOf('--');
const maestroArgs = dashDash === -1 ? passthrough : passthrough.slice(dashDash + 1);
const target = maestroArgs.length ? maestroArgs : [maestroDir];

const seedEnv = [];
try {
  for (const { prefix, label } of SEEDED_REPORTS) {
    // Sequential, not Promise.all: each seed mints an account through the OTP
    // endpoint, and firing them together is the one thing the OTP rate limiter
    // is there to notice.
    const { reportId, reportTitle } = await seedOpenReport(label);
    process.stdout.write(`[run-e2e] seeded open report: ${reportId} "${reportTitle}"\n`);

    // The ONE sequence Maestro does not pass through untouched: a `${...}` inside
    // a value is itself re-interpolated during substitution, and a name it cannot
    // resolve silently becomes the string "undefined" — measured, not assumed. No
    // label uses it today; this makes a future one fail here, naming the cause,
    // instead of in a selector that looks like a broken screen.
    if (reportTitle.includes('${')) {
      throw new Error(
        `seeded title contains "\${" and would be mangled by Maestro's ` +
          `substitution: ${reportTitle}`,
      );
    }
    seedEnv.push(
      '-e',
      `${prefix}_ID=${reportId}`,
      '-e',
      `${prefix}_TITLE=${reportTitle}`,
    );
  }
} catch (err) {
  process.stderr.write(
    `\n[run-e2e] Could not seed a report: ${err.message}\n` +
      '          Is the API up? `docker compose up -d` from the repo root.\n' +
      '          Publishing also needs an admin account — `pnpm db:seed` provisions one.\n\n',
  );
  process.exit(1);
}

const child = spawn(
  'maestro',
  ['test', ...target, '-e', `EXPO_DEV_URL=${expoDevUrl}`, ...seedEnv],
  { stdio: 'inherit', cwd: maestroDir },
);

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  process.stderr.write(
    `\n[run-e2e] Could not run maestro: ${err.message}\n` +
      '          Install it: curl -fsSL https://get.maestro.mobile.dev | bash\n\n',
  );
  process.exit(1);
});
