import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-error";
import { isStaleConflict, moderationErrorMessage } from "@/features/moderation/moderation-errors";
import {
  automatedCheck,
  countNeverChecked,
  decisionCopy,
  photoStateCopy,
  providerState,
  reasonCopy,
  reasonLabel,
  reasonTone,
  riskCopy,
  triggeredReasons,
  unavailableCopy,
  verificationStatusTone,
  wasNeverChecked,
} from "./reason-copy";
import type {
  PhotoDecisionReason,
  PhotoUnavailableReason,
  ReportPhotoDetail,
  ReportPhotoRow,
} from "./types";
import { formatBytes, humaniseKey, photoStatusRef, readSummary, reportContextOf } from "./wire";

/**
 * The decision logic behind Photo Verification.
 *
 * Node environment, no rendering — deliberate, per `vitest.config.ts`. What is
 * worth testing here is what the console DECIDES: which refusal means "someone
 * else got there first", whether a machine verdict can be mistaken for a human
 * one, and whether a figure the API did not send can become a zero. All of that
 * is pure functions.
 */

const refuse = (code: string, status = 409) => new ApiError("server prose", { status, code });

describe("photo review refusals", () => {
  // The 409 named in the contract. It is not a crash and must not read as one:
  // two moderators working one short queue is the expected case, not an edge.
  it("tells the operator that someone else already decided", () => {
    const message = moderationErrorMessage(refuse("PHOTO_ALREADY_REVIEWED"));
    expect(message).not.toBe("server prose");
    expect(message).toMatch(/another admin/i);
    expect(message).toMatch(/refreshed/i);
  });

  it("explains a vanished photo record without blaming the file", () => {
    // The decision row outlives the bytes on purpose — quarantined files are
    // deleted when a rejection's retention window closes. So "not found" here
    // means the RECORD went, which is a different and more alarming thing.
    expect(moderationErrorMessage(refuse("PHOTO_NOT_FOUND", 404))).toMatch(/record/i);
  });

  it.each(["PHOTO_ALREADY_REVIEWED", "PHOTO_NOT_FOUND"])(
    "treats %s as stale state worth refetching",
    (code) => {
      expect(isStaleConflict(refuse(code))).toBe(true);
    },
  );

  // A permission refusal is the system working. Refetching cannot change it,
  // and classifying it as stale would make the dialog silently re-ask.
  it("does not treat a permission refusal as stale state", () => {
    expect(isStaleConflict(refuse("ADMIN_MISSING_PERMISSION", 403))).toBe(false);
  });

  // The property that makes every earlier wrong guess harmless.
  it("falls through to the API's own prose for a photo code it has not heard of", () => {
    expect(moderationErrorMessage(refuse("PHOTO_SOMETHING_NEW"))).toBe("server prose");
    expect(isStaleConflict(refuse("PHOTO_SOMETHING_NEW"))).toBe(false);
  });

  it("does not blame the photo when the console cannot reach the API", () => {
    const offline = new ApiError("fetch failed", { status: null });
    expect(moderationErrorMessage(offline)).toMatch(/couldn't reach the API/i);
  });
});

/**
 * Rule 1: render the labels the backend says FIRED. Rekognition returns the
 * whole ancestor chain, so re-deriving anything here would undo the API's
 * emergency carve-out on screen and show "graphic violence" on the injury
 * photographs Uthavu exists to carry.
 */
describe("triggered labels", () => {
  const ALL: PhotoDecisionReason[] = [
    "explicit-content",
    "hate-symbols",
    "unusable-quality",
    "partial-nudity",
    "swimwear-or-underwear",
    "graphic-violence",
    "visually-disturbing",
    "weapons",
    "drugs",
    "not-photographic",
    "category-mismatch",
    "duplicate-image",
    "verification-unavailable",
  ];

  it("has wording for every reason the decision engine can emit", () => {
    for (const code of ALL) {
      const copy = reasonCopy(code);
      expect(copy, code).not.toBeNull();
      expect(copy!.label).not.toBe(code);
      expect(copy!.detail.length).toBeGreaterThan(20);
    }
  });

  // Fails OPEN on the label, deliberately: a photo held for a cause the console
  // cannot name is far better than a photo held for no visible cause at all.
  it("echoes a reason code this build has never heard of rather than blanking", () => {
    expect(reasonLabel("some-future-signal")).toBe("some-future-signal");
    expect(reasonCopy("some-future-signal")).toBeNull();
    expect(reasonTone("some-future-signal")).toBe("neutral");
  });

  it("colours an outright refusal differently from a request for a human", () => {
    expect(reasonTone("explicit-content")).toBe("danger");
    expect(reasonTone("graphic-violence")).toBe("warning");
  });

  // The three reasons whose copy exists to STOP an over-reading. Each one is a
  // claim the product must not make, so each is asserted rather than trusted.
  it("says what the weapons, drugs and not-photographic signals do NOT mean", () => {
    expect(reasonCopy("weapons")!.detail).toMatch(/not an accusation/i);
    expect(reasonCopy("drugs")!.detail).toMatch(/never a refusal/i);
    expect(reasonCopy("not-photographic")!.detail).toMatch(/NOT an AI-generation/);
  });

  // "We could not check" and "we checked and it is fine" must never collapse.
  it("describes an unavailable check as held, not judged", () => {
    expect(reasonCopy("verification-unavailable")!.detail).toMatch(/held, not judged/i);
  });
});

/**
 * Rule 2: an AI result is not an admin decision. The whole defence against an
 * admin trusting a machine verdict as a human one is the wording, so the
 * wording is what gets asserted.
 */
describe("machine verdict wording", () => {
  it("never words a machine verdict as a human approval or rejection", () => {
    for (const decision of ["pass", "review", "reject"] as const) {
      const label = decisionCopy(decision).label;
      expect(label, decision).not.toMatch(/^Approved$/i);
      expect(label, decision).not.toMatch(/^Rejected$/i);
    }
    expect(decisionCopy("pass").label).toMatch(/automatically/i);
    expect(decisionCopy("reject").label).toMatch(/automatically/i);
  });

  it("says out loud that a cleared photo was not looked at by anyone", () => {
    expect(decisionCopy("pass").detail).toMatch(/no human/i);
  });

  it("does not invent a verdict for a photo the engine never ran against", () => {
    expect(decisionCopy(null).label).toBe("No verdict yet");
    expect(riskCopy(null).label).toBe("Not scored");
    expect(riskCopy(null).tone).toBe("neutral");
  });
});

/**
 * Rule 3: no credentials exist in this environment and the integration has
 * never been exercised against live AWS. "Configured" is the only claim the
 * console may make, and this is the test that stops it drifting into "verified".
 */
describe("provider state", () => {
  it("says Rekognition is configured but never validated against live AWS", () => {
    const state = providerState("aws-rekognition");
    expect(state.configured).toBe(true);
    expect(state.label).toMatch(/Rekognition/);
    expect(state.note).toMatch(/never been run against live AWS/i);
    // "verified" may appear here ONLY as a denial. This is the assertion that
    // stops the copy drifting into "verified by Amazon Rekognition" — a claim
    // nobody in this environment has ever been in a position to make.
    expect(state.note).toMatch(/not verified/i);
    expect(state.note).not.toMatch(/(?<!not )verified/i);
  });

  it("says an unconfigured photo is unexamined, not safe", () => {
    const state = providerState("unconfigured");
    expect(state.configured).toBe(false);
    expect(state.note).toMatch(/unexamined, not safe/i);
  });

  it("reports an unknown provider verbatim rather than guessing at it", () => {
    expect(providerState("some-future-vendor").label).toBe("some-future-vendor");
    expect(providerState(null).configured).toBe(false);
  });
});

describe("verificationStatusTone", () => {
  // `failed` is not a synonym for `review_required`. Both put a photo in front
  // of a human; only one of them means the provider is down, and an operator
  // watching the queue fill up has to be able to tell them apart.
  it("separates a failed check from one that merely needs review", () => {
    expect(verificationStatusTone("failed")).not.toBe(verificationStatusTone("review_required"));
  });

  // Red on a photograph is read as a judgement about the photograph, and this
  // is the one state where nothing has judged it. Grey is what "no information"
  // looks like; amber is reserved for a check that actually flagged something.
  it("does not tint an unchecked photo as if something were wrong with it", () => {
    expect(verificationStatusTone("failed")).toBe("neutral");
    expect(verificationStatusTone("review_required")).toBe("warning");
    expect(verificationStatusTone("rejected")).toBe("danger");
  });

  it("falls back to neutral for a status key this build has not heard of", () => {
    expect(verificationStatusTone("some_future_state")).toBe("neutral");
    expect(verificationStatusTone(null)).toBe("neutral");
  });
});

/**
 * The two wire shapes this console reads tolerantly, because the endpoints were
 * being written in parallel with it. Guessing wrong renders "undefined" at a
 * moderator; reading both costs nothing.
 */
describe("photoStatusRef", () => {
  it("reads the bare-string form and labels it readably", () => {
    expect(photoStatusRef("review_required")).toEqual({
      key: "review_required",
      label: "Review Required",
    });
  });

  it("prefers the API's own label over a derived one", () => {
    expect(photoStatusRef({ key: "review_required", label: "Needs a human" })).toEqual({
      key: "review_required",
      label: "Needs a human",
    });
  });

  it("derives a label when the object carries only a key", () => {
    expect(photoStatusRef({ key: "failed" })).toEqual({ key: "failed", label: "Failed" });
  });

  it("returns null for nothing at all, which is a real state before verification", () => {
    for (const value of [null, undefined, "", "   ", 7, {}, { label: "Orphan" }]) {
      expect(photoStatusRef(value), String(value)).toBeNull();
    }
  });

  it("humanises a key without inventing words", () => {
    expect(humaniseKey("review_required")).toBe("Review Required");
    expect(humaniseKey("passed")).toBe("Passed");
  });
});

describe("reportContextOf", () => {
  const base = { id: "p1", createdAt: "2026-09-01T00:00:00.000Z" } as unknown as ReportPhotoDetail;

  it("reads a nested report object", () => {
    const context = reportContextOf({
      ...base,
      report: {
        title: "Dog hit by a car",
        description: "Near the bus stand",
        landmark: "Bus stand",
        lat: 13.08,
        lng: 80.27,
        createdAt: "2026-09-01T10:00:00.000Z",
        reporter: { id: "u1", name: "Kavya" },
      },
    } as ReportPhotoDetail);

    expect(context?.title).toBe("Dog hit by a car");
    expect(context?.lat).toBe(13.08);
    expect(context?.reporter).toEqual({ id: "u1", name: "Kavya" });
  });

  it("reads the flat form the row already carries", () => {
    const context = reportContextOf({
      ...base,
      reportTitle: "Flooded street",
      reportLandmark: "Anna Nagar",
      reportLat: 13.09,
      reportLng: 80.21,
      reporter: { id: "u2", name: "Ravi" },
    } as ReportPhotoDetail);

    expect(context?.title).toBe("Flooded street");
    expect(context?.landmark).toBe("Anna Nagar");
    expect(context?.reporter?.name).toBe("Ravi");
  });

  it("prefers the nested value when both shapes are present", () => {
    const context = reportContextOf({
      ...base,
      reportTitle: "stale flat title",
      report: { title: "nested title" },
    } as ReportPhotoDetail);

    expect(context?.title).toBe("nested title");
  });

  // A quarantined photo legitimately has no report: verification happens BEFORE
  // the report is created, which is what makes the gate a gate. That has to be
  // distinguishable from "the panel failed to populate".
  it("returns null when there is genuinely no report yet", () => {
    expect(reportContextOf({ ...base } as ReportPhotoDetail)).toBeNull();
    expect(reportContextOf({ ...base, report: null } as ReportPhotoDetail)).toBeNull();
  });

  it("does not treat a lone coordinate as a report", () => {
    expect(reportContextOf({ ...base, reportLat: 13.09 } as ReportPhotoDetail)).toBeNull();
  });
});

/**
 * The counters. A fabricated zero beside "Pending review" tells a moderator the
 * queue is clear, which is the single worst thing this page could say.
 */
describe("readSummary", () => {
  it("reads the three figures", () => {
    expect(readSummary({ pendingReview: 4, highRisk: 1, today: 12 })).toEqual({
      pendingReview: 4,
      highRisk: 1,
      today: 12,
    });
  });

  it("keeps a real zero, which is a genuine answer", () => {
    expect(readSummary({ pendingReview: 0, highRisk: 0, today: 0 }).pendingReview).toBe(0);
  });

  it.each([
    ["a missing key", {}],
    ["a null", { pendingReview: null }],
    ["a numeric string", { pendingReview: "4" }],
    ["NaN", { pendingReview: Number.NaN }],
    ["an object", { pendingReview: { value: 4 } }],
    ["a non-object body", "nope"],
  ])("never turns %s into a zero", (_label, body) => {
    expect(readSummary(body).pendingReview).toBeNull();
  });
});

describe("formatBytes", () => {
  it("scales without pretending to precision it does not have", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1024 * 1024 * 3)).toBe("3.0 MB");
  });

  it("returns null rather than 0 B for a size the API did not send", () => {
    for (const value of [null, undefined, Number.NaN, -1]) {
      expect(formatBytes(value)).toBeNull();
    }
  });
});

/**
 * ==========================================================================
 * THE DISTINCTION THIS FEATURE IS BUILT AROUND: `failed` IS NOT
 * `review_required`.
 * ==========================================================================
 * Both put a photograph in front of a moderator and they mean opposite things.
 * `review_required` says the check ran and something needs a human — the
 * verdict, the risk band and the labels are all measurements. `failed` says the
 * check NEVER RAN, so the model has no opinion at all.
 *
 * The trap is that the API stores a full-looking row either way: an unavailable
 * outcome is written as verdict `review`, risk `medium`, and a signal summary
 * reading nudity "none", violence "none", drugs "none", weapons "none". Those
 * are resting defaults, written so the photo would queue. Rendered as they
 * stand they say "we looked and found nothing" to somebody deciding whether to
 * publish a stranger's emergency photograph.
 *
 * These are the tests that stop that copy coming back.
 */

/** Exactly what `verification-decision.ts` writes for an unavailable outcome. */
const unchecked = (over: Partial<ReportPhotoRow> = {}) =>
  ({
    id: "p-failed",
    verificationStatus: "failed",
    decision: "review",
    riskLevel: "medium",
    reasons: ["verification-unavailable"],
    ...over,
  }) as ReportPhotoRow;

const analysed = (over: Partial<ReportPhotoRow> = {}) =>
  ({
    id: "p-review",
    verificationStatus: "review_required",
    decision: "review",
    riskLevel: "medium",
    reasons: ["weapons"],
    ...over,
  }) as ReportPhotoRow;

const ALL_UNAVAILABLE: PhotoUnavailableReason[] = [
  "not-configured",
  "timeout",
  "throttled",
  "rejected-image",
  "provider-error",
  "invalid-response",
];

describe("was this photo ever examined?", () => {
  it("reads the status key the queue row carries", () => {
    expect(wasNeverChecked(unchecked({ reasons: [] }))).toBe(true);
    expect(wasNeverChecked(analysed())).toBe(false);
  });

  // The row and the detail carry different subsets of the three signals —
  // `unavailableReason` is on the detail only — so any one of them is enough.
  // Requiring all three would let a queue row fall through to "checked", which
  // is the exact failure this predicate exists to prevent.
  it.each([
    ["the status key alone", { verificationStatus: "failed" }],
    ["the reason code alone", { reasons: ["verification-unavailable"] }],
    ["the detail's unavailableReason alone", { unavailableReason: "timeout" }],
  ])("treats %s as proof nothing examined the photo", (_label, photo) => {
    expect(wasNeverChecked(photo)).toBe(true);
  });

  it("does not call a photo unchecked just because it has no verdict yet", () => {
    // Still `verifying`. Nothing has examined it either, but that is a photo
    // mid-flight, not a provider that failed — and it is not in the queue's
    // resting view at all.
    expect(wasNeverChecked({ verificationStatus: "verifying", reasons: [] })).toBe(false);
    expect(wasNeverChecked({})).toBe(false);
  });

  it("counts the unchecked rows on a page without touching the checked ones", () => {
    expect(countNeverChecked([unchecked(), analysed(), unchecked()])).toBe(2);
    expect(countNeverChecked([analysed()])).toBe(0);
    expect(countNeverChecked([])).toBe(0);
  });
});

/**
 * The rule with teeth: an unchecked photo yields NO verdict and NO risk band.
 *
 * `automatedCheck` is a discriminated union rather than a bag of optional
 * fields precisely so this cannot be got wrong by forgetting an `if` at a call
 * site — on the `ran: false` branch there is no `decision` and no `risk` to
 * reach for. These assertions hold the shape as well as the words.
 */
describe("automatedCheck", () => {
  it("refuses to produce a verdict or a risk band for a photo nothing examined", () => {
    const check = automatedCheck(unchecked());

    expect(check.ran).toBe(false);
    // The API's stored `review` / `medium` are defaults, not measurements. They
    // must not be reachable from here at all.
    expect(check).not.toHaveProperty("decision");
    expect(check).not.toHaveProperty("risk");
    expect(JSON.stringify(check)).not.toMatch(/medium/i);
  });

  it("says the check did not run, never that the photo is clear", () => {
    const check = automatedCheck(unchecked());
    if (check.ran) throw new Error("expected an unchecked photo");

    expect(check.label).toMatch(/not checked/i);
    expect(check.summary).toMatch(/nothing examined/i);
    // The three sentences a moderator reads as reassurance. None of them may
    // appear about a photograph nobody has looked at.
    for (const wrong of [/nothing flagged/i, /no signals/i, /found nothing/i, /\bcleared\b/i]) {
      expect(check.summary + check.cause + check.guidance, String(wrong)).not.toMatch(wrong);
    }
    // And it has to tell them what to do instead, because there is no signal.
    expect(check.guidance).toMatch(/photograph itself/i);
  });

  it("names the cause on the detail, and admits the queue row has none", () => {
    const onDetail = automatedCheck({ ...unchecked(), unavailableReason: "not-configured" });
    if (onDetail.ran) throw new Error("expected an unchecked photo");
    expect(onDetail.cause).toMatch(/no moderation provider is configured/i);

    // The list projection does not carry `unavailableReason`. Saying so beats
    // inventing a cause or leaving the sentence blank.
    const onRow = automatedCheck(unchecked());
    if (onRow.ran) throw new Error("expected an unchecked photo");
    expect(onRow.cause).toMatch(/open the photo/i);
  });

  it("still hands back the verdict and the risk for a photo that WAS examined", () => {
    const check = automatedCheck(analysed({ decision: "reject", riskLevel: "high" }));
    if (!check.ran) throw new Error("expected an analysed photo");

    expect(check.decision.label).toBe(decisionCopy("reject").label);
    expect(check.risk.label).toBe("High");
    expect(check.reasons).toEqual(["weapons"]);
  });

  // A photo with a real finding is not turned into "not checked" by anything.
  it("does not swallow a genuine finding", () => {
    const check = automatedCheck(analysed({ reasons: ["explicit-content"], decision: "reject" }));
    expect(check.ran).toBe(true);
    expect(check.reasons).toEqual(["explicit-content"]);
  });
});

/**
 * `verification-unavailable` is a fact about the CHECK, not about the image.
 * Everywhere it could be mistaken for a finding, it is either re-toned or moved
 * to the block that explains it properly.
 */
describe("the verification-unavailable code never reads as a finding", () => {
  it("is not tinted like something the model flagged", () => {
    expect(reasonTone("verification-unavailable")).toBe("neutral");
    expect(reasonTone("verification-unavailable")).not.toBe(reasonTone("weapons"));
    expect(reasonTone("verification-unavailable")).not.toBe(reasonTone("explicit-content"));
    expect(reasonCopy("verification-unavailable")!.severity).toBe("not-a-finding");
  });

  it("is worded as an absence of examination, not as an observation", () => {
    const copy = reasonCopy("verification-unavailable")!;
    expect(copy.label).toMatch(/not checked/i);
    expect(copy.detail).toMatch(/nothing examined/i);
    expect(copy.detail).toMatch(/held, not judged/i);
    // "Analysed"/"detected" here would put the model at the scene.
    expect(copy.detail).not.toMatch(/detected/i);
  });

  // It is filtered out of "Triggered labels" and promoted to its own block,
  // which says strictly more. Everything else passes through untouched — the
  // console still never invents or withholds a real label.
  it("is kept out of the triggered-labels list, and nothing else is", () => {
    expect(triggeredReasons(["verification-unavailable"])).toEqual([]);
    expect(triggeredReasons(["weapons", "verification-unavailable", "drugs"])).toEqual([
      "weapons",
      "drugs",
    ]);
    expect(triggeredReasons(["some-future-signal"])).toEqual(["some-future-signal"]);
    expect(triggeredReasons(null)).toEqual([]);
  });
});

/**
 * Six causes, six sentences. Each one has to send an operator somewhere
 * different — "nobody configured Rekognition" and "Rekognition timed out" are
 * different problems — and none of them may read as something seen in the
 * photograph.
 */
describe("why the check did not run", () => {
  // The vocabulary of a finding. Any of these words in this copy would turn
  // "we could not check" into "we checked and here is what we saw".
  const FINDING_WORDS =
    /\b(unsafe|explicit|nudity|violen\w*|weapon\w*|drug\w*|gore|inappropriate|flagged|detected|clean|risky?|suspicious|disturbing)\b/i;

  it("has distinct prose for every reason the API can record", () => {
    const prose = ALL_UNAVAILABLE.map((reason) => unavailableCopy(reason)!);
    for (const [index, sentence] of prose.entries()) {
      expect(sentence, ALL_UNAVAILABLE[index]).toBeTruthy();
      expect(sentence.length, ALL_UNAVAILABLE[index]).toBeGreaterThan(30);
    }
    // Distinct, not six polite paraphrases of "something went wrong".
    expect(new Set(prose).size).toBe(ALL_UNAVAILABLE.length);
  });

  it("never describes the photograph", () => {
    for (const reason of ALL_UNAVAILABLE) {
      expect(unavailableCopy(reason)!, reason).not.toMatch(FINDING_WORDS);
    }
  });

  // The one most likely to be misread: the provider turned the FILE away. That
  // is about bytes, not about content, and the copy has to say so.
  it("makes rejected-image about the file, not about what is in the photo", () => {
    const copy = unavailableCopy("rejected-image")!;
    expect(copy).toMatch(/file/i);
    expect(copy).toMatch(/not about what the photograph shows/i);
  });

  it("names the environment's actual state plainly", () => {
    expect(unavailableCopy("not-configured")!).toMatch(/no moderation provider is configured/i);
  });

  it("shows an unknown cause verbatim without dressing it up as a finding", () => {
    const copy = unavailableCopy("some-future-failure")!;
    expect(copy).toMatch(/some-future-failure/);
    expect(copy).toMatch(/did not run/i);
    expect(copy).not.toMatch(FINDING_WORDS);
  });

  it("returns nothing at all when an analysis actually ran", () => {
    expect(unavailableCopy(null)).toBeNull();
  });
});

/**
 * The queue's "Review state" column and the detail header.
 *
 * The seeded label for `failed` is "Verification failed", and the list
 * projection sends the bare key, which `humaniseKey` renders "Failed". Both sit
 * inches from a photograph, in a column about that photograph, and both read as
 * a verdict on it. This is the one lookup label the console overrides.
 */
describe("photoStateCopy", () => {
  it("never labels an unchecked photo as one that failed", () => {
    const state = photoStateCopy({ key: "failed", label: "Verification failed" })!;
    expect(state.label).toBe("Not checked");
    expect(state.label).not.toMatch(/fail/i);
    expect(state.tone).toBe("neutral");
  });

  it("still defers to the API's label for every other status", () => {
    expect(photoStateCopy({ key: "review_required", label: "Review required" })).toEqual({
      label: "Review required",
      tone: "warning",
    });
    expect(photoStateCopy({ key: "some_future_state", label: "Whatever" })).toEqual({
      label: "Whatever",
      tone: "neutral",
    });
  });

  it("renders nothing for a photo with no status yet, which is a real state", () => {
    expect(photoStateCopy(null)).toBeNull();
  });
});
