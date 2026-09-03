import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import {
  isSponsorStaleConflict,
  sponsorErrorMessage,
} from "./sponsor-errors";
import {
  PLACEMENTS,
  placementDelivery,
  placementLabel,
  placementRendersNowhere,
} from "./placements";

/**
 * What an operator is told when the API refuses something.
 *
 * These map a CODE to prose. The codes are the contract; the API's own wording
 * gets reworded, and this file exists so the console never branches on a
 * message string.
 */
describe("sponsorErrorMessage", () => {
  const refuse = (code: string) => new ApiError("server prose", { status: 409, code });

  it("explains each readiness refusal in the operator's terms", () => {
    for (const code of [
      "SPONSOR_NO_PLACEMENTS",
      "SPONSOR_CREATIVE_URL_REQUIRED",
      "SPONSOR_WINDOW_EXPIRED",
    ]) {
      const message = sponsorErrorMessage(refuse(code));
      expect(message).not.toBe("server prose");
      expect(message.length).toBeGreaterThan(30);
    }
  });

  // The guard added after activating an already-closed campaign returned 201
  // with a green success toast while the citizen feed stayed empty.
  it("tells the operator an expired window is why activation was refused", () => {
    expect(sponsorErrorMessage(refuse("SPONSOR_WINDOW_EXPIRED"))).toMatch(/end date/i);
  });

  // The design that made earlier wrong guesses harmless: an unknown code
  // degrades to the API's own sentence, never to silence.
  it("falls through to the API's own prose for a code it has not heard of", () => {
    expect(sponsorErrorMessage(refuse("SPONSOR_SOMETHING_NEW"))).toBe("server prose");
  });

  it("does not blame the campaign when the console cannot reach the API", () => {
    const offline = new ApiError("fetch failed", { status: null, code: null });
    expect(offline.isNetworkFailure).toBe(true);
    expect(sponsorErrorMessage(offline)).toMatch(/couldn't reach the API/i);
  });
});

/**
 * Refetching helps for "the record already moved" and is useless for "this
 * campaign is not ready to run" — the distinction decides what the UI does next.
 */
describe("isSponsorStaleConflict", () => {
  it.each(["SPONSOR_NOT_FOUND", "SPONSOR_ALREADY_ACTIVE", "SPONSOR_ALREADY_PAUSED"])(
    "treats %s as stale state worth refetching",
    (code) => {
      expect(isSponsorStaleConflict(new ApiError("x", { status: 409, code }))).toBe(true);
    },
  );

  it.each(["SPONSOR_NO_PLACEMENTS", "SPONSOR_CREATIVE_URL_REQUIRED", "SPONSOR_WINDOW_EXPIRED"])(
    "treats %s as a readiness refusal that refetching cannot fix",
    (code) => {
      expect(isSponsorStaleConflict(new ApiError("x", { status: 409, code }))).toBe(false);
    },
  );
});

/**
 * Which placements actually reach a phone.
 *
 * `community_impact` is accepted by the API and mounted by no mobile screen, so
 * a campaign carrying only that key passes every server check and appears
 * nowhere. The console has to say so before the operator activates it.
 */
describe("placement delivery", () => {
  it("knows community_impact renders nowhere and the other three do", () => {
    expect(placementRendersNowhere("community_impact")).toBe(true);
    for (const key of ["home", "impact_stories", "category_list"]) {
      expect(placementRendersNowhere(key)).toBe(false);
    }
  });

  it("distinguishes a wasted tick box from a campaign that shows nowhere at all", () => {
    // Runs fine on the home feed; the extra key is only waste.
    expect(placementDelivery(["home", "community_impact"])).toEqual({
      undelivered: ["community_impact"],
      showsNowhere: false,
    });
    // Passes SPONSOR_NO_PLACEMENTS and still reaches no screen.
    expect(placementDelivery(["community_impact"])).toEqual({
      undelivered: ["community_impact"],
      showsNowhere: true,
    });
  });

  it("does not call an empty selection 'shows nowhere' — that is the API's refusal, not ours", () => {
    expect(placementDelivery([])).toEqual({ undelivered: [], showsNowhere: false });
  });

  // Fails OPEN on an unknown key: this console must never accuse a placement it
  // cannot testify about.
  it("says nothing about a placement key this build has not heard of", () => {
    expect(placementRendersNowhere("some_future_surface")).toBe(false);
    expect(placementDelivery(["some_future_surface"])).toEqual({
      undelivered: [],
      showsNowhere: false,
    });
  });

  it("labels every known placement, and echoes an unknown key rather than blanking", () => {
    for (const placement of PLACEMENTS) {
      expect(placementLabel(placement.key)).toBe(placement.label);
    }
    expect(placementLabel("some_future_surface")).toBe("some_future_surface");
  });
});
