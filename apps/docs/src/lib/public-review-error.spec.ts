import { describe, expect, it } from "vitest";
import {
  formatPublicReviewRecoveryTime,
  publicReviewErrorKey,
} from "./public-review-error";

describe("publicReviewErrorKey", () => {
  it("separates file, quota, model timeout, validation and upstream failures", () => {
    expect(publicReviewErrorKey("HTTP_400")).toBe("file");
    expect(publicReviewErrorKey("LIMIT_REACHED")).toBe("limit");
    expect(publicReviewErrorKey("VISITOR_LIMIT_REACHED")).toBe("visitorLimit");
    expect(publicReviewErrorKey("NETWORK_LIMIT_REACHED")).toBe("networkLimit");
    expect(publicReviewErrorKey("ROLLING_BUDGET_EXHAUSTED")).toBe(
      "sharedLimit",
    );
    expect(publicReviewErrorKey("DUPLICATE_ACTIVITY_REVIEW")).toBe(
      "activityLimit",
    );
    expect(publicReviewErrorKey("UPSTREAM_TIMEOUT")).toBe("timeout");
    expect(publicReviewErrorKey("RESPONSE_INVALID")).toBe("invalidResponse");
    expect(publicReviewErrorKey("UPSTREAM_UNAVAILABLE")).toBe("upstream");
    expect(publicReviewErrorKey("INTERNAL_ERROR")).toBe("generation");
    expect(publicReviewErrorKey("NETWORK_FAILURE")).toBe("request");
  });

  it("formats the admission reset time in the requested locale and timezone", () => {
    expect(
      formatPublicReviewRecoveryTime(
        "2026-08-12T00:00:00.000Z",
        "zh-CN",
        "Asia/Shanghai",
      ),
    ).toContain("2026");
    expect(formatPublicReviewRecoveryTime("invalid", "zh-CN")).toBeNull();
  });
});
