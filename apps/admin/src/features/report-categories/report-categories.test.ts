import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";
import {
  CODE_TO_FIELD,
  categoryErrorMessage,
  isCategoryStaleConflict,
} from "./category-errors";
import {
  categoryFormSchema,
  categoryToFormValues,
  formValuesToCreatePayload,
  formValuesToUpdatePayload,
  isCategoryFieldName,
} from "./schema";
import { formatExpiry } from "./use-report-categories";

const refuse = (code: string, status = 409) =>
  new ApiError("server prose", { status, code });

describe("categoryErrorMessage", () => {
  it("rewords the codes whose API prose an operator should not see raw", () => {
    for (const code of ["CATEGORY_NOT_FOUND", "NO_EFFECTIVE_CHANGE"]) {
      const message = categoryErrorMessage(refuse(code));
      expect(message).not.toBe("server prose");
      expect(message.length).toBeGreaterThan(30);
    }
  });

  it.each([
    // Carries a live report count and names the alternative.
    "CATEGORY_IN_USE",
    // Quotes the key that collided.
    "CATEGORY_KEY_TAKEN",
    // Worded for the action taken — delete reads differently from hide — so a
    // fixed sentence here would be wrong half the time.
    "CATEGORY_LAST_REMAINING",
  ])("passes %s through, because the API's message carries what matters", (code) => {
    expect(categoryErrorMessage(refuse(code))).toBe("server prose");
  });

  it("falls through to the API's own prose for a code it has not heard of", () => {
    expect(categoryErrorMessage(refuse("CATEGORY_SOMETHING_NEW"))).toBe("server prose");
  });

  it("does not blame the category when the console cannot reach the API", () => {
    const offline = new ApiError("fetch failed", { status: null, code: null });

    expect(offline.isNetworkFailure).toBe(true);
    expect(categoryErrorMessage(offline)).toMatch(/couldn't reach the API/i);
  });
});

describe("isCategoryStaleConflict", () => {
  it("treats a vanished category as stale state worth refetching", () => {
    expect(isCategoryStaleConflict(refuse("CATEGORY_NOT_FOUND", 404))).toBe(true);
  });

  it.each(["CATEGORY_IN_USE", "CATEGORY_LAST_REMAINING"])(
    "does NOT treat %s as stale — the row on screen is accurate, the action is refused",
    (code) => {
      // The distinction matters: refetching on these would make the table flash
      // for a refusal that has nothing to do with the table being out of date.
      expect(isCategoryStaleConflict(refuse(code))).toBe(false);
    },
  );
});

describe("CODE_TO_FIELD", () => {
  it("routes a key collision back onto the key field", () => {
    // CATEGORY_KEY_TAKEN arrives as a bare `{ code, message }` — the service
    // checks for the collision by hand, so there is no Zod `errors[]` for the
    // generic field mapper to read. Without this entry a one-field problem lands
    // in the form-level banner.
    expect(CODE_TO_FIELD.CATEGORY_KEY_TAKEN).toBe("key");
    expect(isCategoryFieldName("key")).toBe(true);
  });

  it("does not route the refusals that are about the whole category", () => {
    // These belong in the banner (or the confirm dialog), not on a field —
    // there is no input the operator could change to satisfy them.
    expect(CODE_TO_FIELD.CATEGORY_IN_USE).toBeUndefined();
    expect(CODE_TO_FIELD.CATEGORY_LAST_REMAINING).toBeUndefined();
  });
});

describe("categoryFormSchema", () => {
  const valid = {
    key: "floodRescue",
    label: "Flood Rescue",
    emoji: "🌊",
    defaultExpiryMinutes: "360",
    citizenSelectable: true,
  };

  it("accepts a well-formed category", () => {
    expect(categoryFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["Flood Rescue", "a space"],
    ["flood-rescue", "a hyphen"],
    ["FloodRescue", "a leading capital"],
    ["9lives", "a leading digit"],
  ])("rejects %s as a key (%s)", (key) => {
    expect(categoryFormSchema.safeParse({ ...valid, key }).success).toBe(false);
  });

  it.each([
    ["0", "instant expiry"],
    ["43201", "past the 30-day bound"],
    ["6h", "units rather than digits"],
    ["1.5", "a decimal"],
  ])("rejects %s as an expiry (%s)", (defaultExpiryMinutes) => {
    expect(
      categoryFormSchema.safeParse({ ...valid, defaultExpiryMinutes }).success,
    ).toBe(false);
  });
});

describe("payload mappers", () => {
  it("drops `key` from an update, rather than merely omitting it from the form", () => {
    // Verified against the running API: a PATCH carrying `key` does NOT 400 —
    // Zod strips it and answers 200 with the ORIGINAL key, so a request that
    // looks like a rename reports success and renames nothing. Dropping it here
    // means the console cannot send that request even by accident.
    const payload = formValuesToUpdatePayload({
      key: "somethingElse",
      label: "Flood Rescue",
      emoji: "🌊",
      defaultExpiryMinutes: "360",
      citizenSelectable: true,
    });

    expect(payload).not.toHaveProperty("key");
    expect(payload.defaultExpiryMinutes).toBe(360);
  });

  it("converts the minutes to a number exactly once, on the way out", () => {
    const payload = formValuesToCreatePayload({
      key: "floodRescue",
      label: "  Flood Rescue  ",
      emoji: " 🌊 ",
      defaultExpiryMinutes: " 90 ",
      citizenSelectable: false,
    });

    expect(payload).toEqual({
      key: "floodRescue",
      label: "Flood Rescue",
      emoji: "🌊",
      defaultExpiryMinutes: 90,
      citizenSelectable: false,
    });
  });

  it("gives a new category sensible defaults and never hands an input null", () => {
    const values = categoryToFormValues(null);

    expect(values).toEqual({
      key: "",
      label: "",
      emoji: "",
      defaultExpiryMinutes: "360",
      citizenSelectable: true,
    });
    // Every field is a string or a boolean — a null here would flip a controlled
    // input to uncontrolled and start silently dropping what is typed.
    for (const value of Object.values(values)) {
      expect(value).not.toBeNull();
    }
  });
});

describe("formatExpiry", () => {
  it.each([
    [360, "6h"],
    [1440, "1d"],
    [4320, "3d"],
    [90, "90m"],
    // Exact divisions only: 100 minutes must not round to "2h" and misstate
    // when a request actually expires.
    [100, "100m"],
  ])("renders %i minutes as %s", (minutes, expected) => {
    expect(formatExpiry(minutes)).toBe(expected);
  });
});
