#!/usr/bin/env node
/**
 * Applies a completed Tamil review back into `libs-mobile/i18n/locales/ta/`.
 *
 * The half that usually fails: a reviewer returns a spreadsheet, somebody
 * hand-copies 200 strings, and both the accuracy and the parity are gone. This
 * writes only the rows with a CORRECTED_TAMIL value, refuses anything that
 * would break the app, and reports what it did.
 *
 * Usage:
 *   node scripts/i18n-review-import.mjs reviewed.csv            # dry run
 *   node scripts/i18n-review-import.mjs reviewed.csv --write    # apply
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TA = join(ROOT, "libs-mobile/i18n/locales/ta");
const EN = join(ROOT, "libs-mobile/i18n/locales/en");

const file = process.argv[2];
const WRITE = process.argv.includes("--write");
if (!file) {
  console.error("usage: node scripts/i18n-review-import.mjs <reviewed.csv> [--write]");
  process.exit(1);
}

/** Minimal RFC4180 parser — reviewers return files from Excel, Sheets and Numbers. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Absolute or repo-relative: the reviewed file arrives from wherever the
// reviewer put it, not necessarily inside the repo.
const raw = readFileSync(isAbsolute(file) ? file : join(ROOT, file), "utf8").replace(/^﻿/, "");
const [header, ...lines] = parseCsv(raw);
const col = (name) => header.indexOf(name);
for (const required of ["namespace", "key", "english", "CORRECTED_TAMIL"]) {
  if (col(required) === -1) { console.error(`missing column: ${required}`); process.exit(1); }
}

const setDeep = (obj, path, value) => {
  const parts = path.split(".");
  let node = obj;
  for (const p of parts.slice(0, -1)) node = node[p] ??= {};
  node[parts.at(-1)] = value;
};
const getDeep = (obj, path) =>
  path.split(".").reduce((n, p) => (n == null ? undefined : n[p]), obj);

/** Every `{{placeholder}}` must survive, or the string renders with a literal gap. */
const placeholders = (s) => (s.match(/\{\{[^}]+\}\}/g) ?? []).sort().join(",");

const catalogues = new Map();
const load = (ns) => {
  if (!catalogues.has(ns)) {
    catalogues.set(ns, {
      ta: JSON.parse(readFileSync(join(TA, `${ns}.json`), "utf8")),
      en: JSON.parse(readFileSync(join(EN, `${ns}.json`), "utf8")),
    });
  }
  return catalogues.get(ns);
};

const applied = [], skipped = [], rejected = [];

for (const line of lines) {
  if (!line[col("key")]) continue;
  const ns = line[col("namespace")], key = line[col("key")];
  const english = line[col("english")], corrected = line[col("CORRECTED_TAMIL")].trim();

  if (!corrected) { skipped.push(`${ns}:${key}`); continue; }

  const { ta, en } = load(ns);

  // The key must still exist — a review can lag the code by weeks.
  if (getDeep(en, key) === undefined) {
    rejected.push(`${ns}:${key} — key no longer exists in en/, ignoring`);
    continue;
  }
  // The English must still match what the reviewer saw, or they translated
  // a sentence the app no longer shows.
  if (getDeep(en, key) !== english) {
    rejected.push(`${ns}:${key} — English changed since export, re-review needed`);
    continue;
  }
  if (placeholders(english) !== placeholders(corrected)) {
    rejected.push(
      `${ns}:${key} — placeholder mismatch: en has [${placeholders(english) || "none"}], ` +
      `correction has [${placeholders(corrected) || "none"}]`,
    );
    continue;
  }

  if (getDeep(ta, key) !== corrected) {
    setDeep(ta, key, corrected);
    applied.push(`${ns}:${key}`);
  } else {
    skipped.push(`${ns}:${key} (unchanged)`);
  }
}

if (WRITE) {
  for (const [ns, { ta }] of catalogues) {
    writeFileSync(join(TA, `${ns}.json`), JSON.stringify(ta, null, 2) + "\n");
  }
}

// Parity is the invariant that must hold after any write.
let parityOk = true;
for (const [ns, { ta, en }] of catalogues) {
  const flat = (o, p = "", s = new Set()) => {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? `${p}.${k}` : k;
      v && typeof v === "object" ? flat(v, key, s) : s.add(key);
    }
    return s;
  };
  const a = flat(en), b = flat(ta);
  const missing = [...a].filter((k) => !b.has(k));
  const extra = [...b].filter((k) => !a.has(k));
  if (missing.length || extra.length) {
    parityOk = false;
    console.error(`PARITY BROKEN in ${ns}: missing=${missing} extra=${extra}`);
  }
}

console.log(`${WRITE ? "APPLIED" : "DRY RUN"} — ${applied.length} corrections, ${skipped.length} skipped, ${rejected.length} rejected`);
for (const r of rejected) console.log(`  REJECTED ${r}`);
console.log(parityOk ? "parity: OK" : "parity: BROKEN");
if (!WRITE && applied.length) console.log("\nRe-run with --write to apply.");
process.exit(parityOk ? 0 : 1);
