import { describe, expect, it } from "vitest";
import {
  decideCoachSidSync,
  normalizeCoachSid,
  resolveActiveCoachSid,
  shouldReleaseEmptyCoachSid,
} from "./coach-sid-model";

const EXISTING = "39b1e053-6431-4c69-aa73-75391bf3cf0a";

describe("normalizeCoachSid", () => {
  it("trims and drops placeholder / empty values", () => {
    expect(normalizeCoachSid("  abc  ")).toBe("abc");
    expect(normalizeCoachSid("default")).toBe("");
    expect(normalizeCoachSid("")).toBe("");
    expect(normalizeCoachSid(null)).toBe("");
  });
});

describe("decideCoachSidSync", () => {
  it("keeps a location sid when useSearchParams is still empty", () => {
    expect(
      decideCoachSidSync({
        searchParamsSid: "",
        rawSearchParamsSid: "",
        locationSid: EXISTING,
        currentSid: EXISTING,
        urlClearPending: false,
        urlApplyPending: false,
      }),
    ).toEqual({
      sid: EXISTING,
      urlClearPending: false,
      urlApplyPending: false,
      stripDefaultFromUrl: false,
    });
  });

  it("adopts the location sid when state is still empty", () => {
    expect(
      decideCoachSidSync({
        searchParamsSid: "",
        rawSearchParamsSid: "",
        locationSid: EXISTING,
        currentSid: "",
        urlClearPending: false,
        urlApplyPending: false,
      }).sid,
    ).toBe(EXISTING);
  });

  it("clears leftover localStorage sid on a bare /ai-coach URL", () => {
    expect(
      decideCoachSidSync({
        searchParamsSid: "",
        rawSearchParamsSid: "",
        locationSid: "",
        currentSid: EXISTING,
        urlClearPending: false,
        urlApplyPending: false,
      }).sid,
    ).toBe("");
  });

  it("does not restore a stale searchParams sid after 新对话", () => {
    const result = decideCoachSidSync({
      searchParamsSid: EXISTING,
      rawSearchParamsSid: EXISTING,
      locationSid: "",
      currentSid: "",
      urlClearPending: true,
      urlApplyPending: false,
    });
    expect(result.sid).toBe("");
    expect(result.urlClearPending).toBe(true);
  });

  it("does not restore from location while 新对话 URL replace is pending", () => {
    const result = decideCoachSidSync({
      searchParamsSid: EXISTING,
      rawSearchParamsSid: EXISTING,
      locationSid: EXISTING,
      currentSid: "",
      urlClearPending: true,
      urlApplyPending: false,
    });
    expect(result.sid).toBe("");
    expect(result.urlClearPending).toBe(true);
  });

  it("releases the clear-pending flag once the address bar dropped sid", () => {
    const result = decideCoachSidSync({
      searchParamsSid: "",
      rawSearchParamsSid: "",
      locationSid: "",
      currentSid: "",
      urlClearPending: true,
      urlApplyPending: false,
    });
    expect(result.sid).toBe("");
    expect(result.urlClearPending).toBe(false);
  });

  it("keeps applySid state while the address bar has not caught up", () => {
    const result = decideCoachSidSync({
      searchParamsSid: "",
      rawSearchParamsSid: "",
      locationSid: "",
      currentSid: EXISTING,
      urlClearPending: false,
      urlApplyPending: true,
    });
    expect(result.sid).toBe(EXISTING);
    expect(result.urlApplyPending).toBe(true);
  });

  it("clears apply-pending once location matches the applied sid", () => {
    const result = decideCoachSidSync({
      searchParamsSid: EXISTING,
      rawSearchParamsSid: EXISTING,
      locationSid: EXISTING,
      currentSid: EXISTING,
      urlClearPending: false,
      urlApplyPending: true,
    });
    expect(result.sid).toBe(EXISTING);
    expect(result.urlApplyPending).toBe(false);
  });

  it("strips placeholder sid=default", () => {
    expect(
      decideCoachSidSync({
        searchParamsSid: "",
        rawSearchParamsSid: "default",
        locationSid: "",
        currentSid: EXISTING,
        urlClearPending: false,
        urlApplyPending: false,
      }),
    ).toMatchObject({
      sid: "",
      stripDefaultFromUrl: true,
    });
  });
});

describe("shouldReleaseEmptyCoachSid", () => {
  it("releases a sticky sid only after a successful empty transcript load", () => {
    expect(
      shouldReleaseEmptyCoachSid({
        sid: EXISTING,
        messagesStatus: "success",
        messageCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldReleaseEmptyCoachSid({
        sid: EXISTING,
        messagesStatus: "success",
        messageCount: 2,
      }),
    ).toBe(false);
    expect(
      shouldReleaseEmptyCoachSid({
        sid: EXISTING,
        messagesStatus: "pending",
        messageCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldReleaseEmptyCoachSid({
        sid: "",
        messagesStatus: "success",
        messageCount: 0,
      }),
    ).toBe(false);
  });
});

describe("resolveActiveCoachSid", () => {
  it("prefers store / location over a lagging empty searchParams", () => {
    expect(
      resolveActiveCoachSid({
        searchParamsSid: "",
        storeSid: EXISTING,
        locationSid: "",
      }),
    ).toBe(EXISTING);
    expect(
      resolveActiveCoachSid({
        searchParamsSid: "",
        storeSid: "",
        locationSid: EXISTING,
      }),
    ).toBe(EXISTING);
  });
});
