import { describe, expect, it } from "vitest";

import { formValuesToPayload, updateFormSchema, type UpdateFormValues } from "./schema";

/**
 * The console's mirror of the announcement rules.
 *
 * WHAT THIS FILE IS ACTUALLY GUARDING
 * ───────────────────────────────────────────────────────────────────────────
 * Not "does validation work" — the DTO spec covers the rule itself
 * (`apps/api/src/admin/dto/community-update-script.spec.ts`). What is tested
 * here is PARITY, and specifically the one place the two schemas are allowed to
 * differ. The API models a missing translation as `null` and rejects `''`; a
 * DOM input cannot produce `null`, so this form models it as `""` and converts
 * on the way out. Transcribing the DTO literally would therefore have made
 * Tamil required and inverted the product rule.
 *
 * That makes blank-Tamil the case worth pinning: a schema that is stricter than
 * the server silently refuses a save the API would have accepted, and nothing
 * errors anywhere to tell you.
 */

const base: UpdateFormValues = {
  titleEn: "Heavy rain warning for Chennai district",
  bodyEn: "Heavy rainfall is expected tonight. Avoid low-lying roads.",
  titleTa: "",
  bodyTa: "",
  publishAt: "",
  expiresAt: "",
};

const parse = (overrides: Partial<UpdateFormValues> = {}) =>
  updateFormSchema.safeParse({ ...base, ...overrides });

const errorFor = (result: ReturnType<typeof parse>, field: keyof UpdateFormValues) =>
  result.success ? undefined : result.error.issues.find((i) => i.path[0] === field)?.message;

describe("English is required and must be English", () => {
  it("accepts an English-only announcement with no Tamil at all", () => {
    expect(parse().success).toBe(true);
  });

  it.each(["titleEn", "bodyEn"] as const)("requires %s", (field) => {
    const result = parse({ [field]: "" });
    expect(result.success).toBe(false);
    expect(errorFor(result, field)).toMatch(/required/i);
  });

  it.each(["titleEn", "bodyEn"] as const)("refuses Tamil script in %s", (field) => {
    const result = parse({ [field]: "சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை" });
    expect(result.success).toBe(false);
    expect(errorFor(result, field)).toMatch(/in English/i);
  });

  it("refuses Tamil spliced into an otherwise English title", () => {
    expect(parse({ titleEn: "Heavy rain warning for சென்னை" }).success).toBe(false);
  });

  it("allows digits, punctuation and loanwords in English", () => {
    const result = parse({
      titleEn: "COVID-19 vaccination camp — Velachery, 9am",
      bodyEn: "Call 1077 (toll-free) or visit the T. Nagar centre.",
    });
    expect(result.success).toBe(true);
  });
});

describe("Tamil is optional, but must be Tamil when written", () => {
  it("accepts both Tamil fields left blank — the whole point of the fallback", () => {
    expect(parse({ titleTa: "", bodyTa: "" }).success).toBe(true);
  });

  it("accepts whitespace-only Tamil, which trims to the blank state", () => {
    expect(parse({ titleTa: "   ", bodyTa: "  " }).success).toBe(true);
  });

  it.each(["titleTa", "bodyTa"] as const)("refuses English typed into %s", (field) => {
    const result = parse({ [field]: "Heavy rain warning for Chennai district" });
    expect(result.success).toBe(false);
    expect(errorFor(result, field)).toMatch(/in Tamil/i);
  });

  it("accepts Tamil carrying Latin digits and loanwords", () => {
    const result = parse({
      titleTa: "COVID-19 தடுப்பூசி முகாம்",
      bodyTa: "உதவிக்கு 1077 என்ற எண்ணை அழைக்கவும்.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a Tamil title over an English body — half-translated is legal", () => {
    expect(parse({ titleTa: "சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை" }).success).toBe(true);
  });
});

describe("blank Tamil leaves the form as the null the API wants", () => {
  it("sends null, never an empty string", () => {
    // `''` would store a Tamil translation that happens to be empty — a blank
    // card shown to a Tamil reader, where null routes them to the English.
    const payload = formValuesToPayload({ ...base, titleTa: "", bodyTa: "   " });
    expect(payload.titleTa).toBeNull();
    expect(payload.bodyTa).toBeNull();
  });

  it("sends trimmed Tamil when it is present", () => {
    const payload = formValuesToPayload({
      ...base,
      titleTa: "  சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை  ",
      bodyTa: "தாழ்வான சாலைகளைத் தவிர்க்கவும்.",
    });
    expect(payload.titleTa).toBe("சென்னை மாவட்டத்தில் கனமழை எச்சரிக்கை");
    expect(payload.bodyTa).toBe("தாழ்வான சாலைகளைத் தவிர்க்கவும்.");
  });
});
