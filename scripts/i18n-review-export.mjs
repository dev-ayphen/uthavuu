#!/usr/bin/env node
/**
 * Builds the Tamil review pack: one CSV a native speaker can actually work
 * through, instead of 13 JSON files with no context.
 *
 * The reviewer needs three things the catalogues do not carry — what the
 * English says, WHERE the string appears, and which strings matter most if they
 * only have an hour. This assembles all three.
 *
 * Usage:  node scripts/i18n-review-export.mjs [outfile.csv]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const EN = join(ROOT, "libs-mobile/i18n/locales/en");
const TA = join(ROOT, "libs-mobile/i18n/locales/ta");

/** Flatten a catalogue to dotted key paths. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/**
 * Where each key is used. Built by grepping the LEAF segment across the app —
 * imprecise on purpose, because a reviewer needs "roughly which screen" and a
 * false extra hit costs them nothing while a missing one costs them the
 * context that decides a translation.
 */
function buildUsageIndex() {
  const out = execSync(
    `grep -rn "t(['\\\`]" apps/mobile/src libs-mobile --include=*.ts --include=*.tsx || true`,
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const index = new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/^([^:]+):\d+:(.*)$/);
    if (!m) continue;
    const [, file, code] = m;
    for (const call of code.matchAll(/t\(\s*['"`]([^'"`]+)['"`]/g)) {
      const key = call[1].includes(":") ? call[1].split(":")[1] : call[1];
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(screenName(file));
    }
  }
  return index;
}

/** "apps/mobile/src/screens/tabs/DashboardScreen.tsx" -> "DashboardScreen" */
function screenName(file) {
  return file.split("/").pop().replace(/\.tsx?$/, "");
}

/**
 * Review priority.
 *
 * Uthavu is an emergency-help product. A clumsy word on the Settings screen is
 * a papercut; a clumsy word on the button that commits somebody to helping a
 * stranger, or on the copy explaining that a phone number is about to be
 * shared, is a safety and trust problem. Tier 1 is what to review if there is
 * only time for some of it.
 */
const CRITICAL = /help|accept|confirm|volunteer|mission|emergency|urgent|expire|phone|contact|call|cancel|delete|report|chat|share|privacy|anonym|suspend|block|flag/i;
const LEGAL_BODIES = new Set(["termsBody", "privacyBody", "guidelinesBody"]);

function tier(ns, key, english) {
  if (ns === "legal" && LEGAL_BODIES.has(key)) return "0-LEGAL-PRO";
  if (CRITICAL.test(key) || CRITICAL.test(english)) return "1-SAFETY";
  if (["auth", "report", "requestDetails", "tabs"].includes(ns)) return "2-CORE";
  return "3-SECONDARY";
}

/** A ta value identical to its English source: either untranslated, or wordless. */
function identicalNote(english, tamil) {
  if (english !== tamil) return "";
  const hasWords = english.replace(/\{\{[^}]+\}\}/g, "").replace(/[^\p{L}]/gu, "").length > 0;
  return hasWords ? "UNTRANSLATED — needs attention" : "no words to translate — correct as-is";
}

const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const usage = buildUsageIndex();
const rows = [];

for (const file of readdirSync(EN).filter((f) => f.endsWith(".json")).sort()) {
  const ns = file.replace(".json", "");
  const en = flatten(JSON.parse(readFileSync(join(EN, file), "utf8")));
  const ta = flatten(JSON.parse(readFileSync(join(TA, file), "utf8")));

  for (const [key, english] of Object.entries(en)) {
    const tamil = ta[key];
    const leaf = key.split(".").pop();
    const seen = [...(usage.get(leaf) ?? usage.get(key) ?? [])].sort().join(", ");
    rows.push({
      tier: tier(ns, leaf, english),
      namespace: ns,
      key,
      english,
      tamil,
      screens: seen || "(not found — may be built dynamically)",
      flag: identicalNote(english, tamil),
    });
  }
}

rows.sort((a, b) =>
  a.tier.localeCompare(b.tier) || a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key),
);

const header = [
  "priority", "namespace", "key", "english", "current_tamil",
  "appears_on", "flag", "CORRECTED_TAMIL", "REVIEWER_NOTES",
];
const body = rows.map((r) =>
  [r.tier, r.namespace, r.key, r.english, r.tamil, r.screens, r.flag, "", ""].map(csv).join(","),
);

const outfile = process.argv[2] ?? "docs/i18n/tamil-review.csv";
writeFileSync(join(ROOT, outfile), "﻿" + [header.map(csv).join(","), ...body].join("\n") + "\n");

const byTier = rows.reduce((acc, r) => ((acc[r.tier] = (acc[r.tier] ?? 0) + 1), acc), {});
console.log(`Wrote ${relative(ROOT, join(ROOT, outfile))} — ${rows.length} strings`);
for (const [t, n] of Object.entries(byTier).sort()) console.log(`  ${t.padEnd(14)} ${n}`);
console.log(`  flagged untranslated: ${rows.filter((r) => r.flag.startsWith("UNTRANSLATED")).length}`);
