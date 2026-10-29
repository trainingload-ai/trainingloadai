import { describe, expect, it } from "vitest";

import { ApiFetchError } from "@/lib/api-error";
import { buildCoachTranscriptErrorItem } from "./coach-transcript-model";
import { resolveCoachVisibleErrorMessage } from "./coach-visible-error";

const OPERATION_COPY: Record<string, string> = {
  accessRequired: "AI access is unavailable.",
  inProgress: "Another AI action is running.",
  settlementPending: "The previous AI action is still finishing.",
  purposeUnavailable:
    "The selected model tier is temporarily unavailable. Please try again later.",
};

const TRANSCRIPT_COPY: Record<string, string> = {
  reasonTimeout: "The request timed out.",
  reasonDisconnect: "The network was interrupted.",
  reasonRateLimit: "Requests are being sent too quickly.",
  reasonAccessRequired: "AI access is unavailable.",
  reasonActionInProgress: "Wait for the current AI operation.",
  reasonSettlementPending: "Previous usage is still settling.",
  reasonModelTierUnavailable: "This model tier is temporarily unavailable.",
  reasonAuth: "Please sign in again.",
  reasonServer: "The coach service is temporarily unavailable.",
  reasonInternal: "Something went wrong on our end.",
  reasonUnknown: "Something went wrong while generating the reply.",
};

const TURN_COPY = {
  modelUnavailable: "The model is temporarily unavailable.",
  aborted: "The request was interrupted.",
  business: "The request could not be completed.",
  internal: "Something went wrong on our end.",
  upstreamFailed: "The upstream service is unavailable.",
  unsafeOutput: "The response could not be shown safely.",
  invalidStructuredOutput: "Structured content could not be generated.",
  unknown: "Something went wrong while generating the response.",
};

function translate() {
  return {
    operation: (key: string) => OPERATION_COPY[key] ?? key,
    turn: (key: keyof typeof TURN_COPY) => TURN_COPY[key],
    transcript: (key: string) => TRANSCRIPT_COPY[key] ?? key,
  };
}

describe("resolveCoachVisibleErrorMessage", () => {
  it("does not surface the raw AI_MODEL_PURPOSE_UNAVAILABLE code", () => {
    const cases: unknown[] = [
      "AI_MODEL_PURPOSE_UNAVAILABLE",
      new Error("AI_MODEL_PURPOSE_UNAVAILABLE"),
      new ApiFetchError(
        "AI_MODEL_PURPOSE_UNAVAILABLE",
        503,
        "AI_MODEL_PURPOSE_UNAVAILABLE",
      ),
      { errorCode: "AI_MODEL_PURPOSE_UNAVAILABLE" },
      JSON.stringify({
        code: "AI_MODEL_PURPOSE_UNAVAILABLE",
        message: "AI_MODEL_PURPOSE_UNAVAILABLE",
      }),
    ];

    for (const error of cases) {
      const message = resolveCoachVisibleErrorMessage(error, translate());
      expect(message).toBe(OPERATION_COPY.purposeUnavailable);
      expect(message).not.toContain("AI_MODEL_PURPOSE_UNAVAILABLE");
    }
  });

  it("maps other AI operation codes to human copy instead of the enum", () => {
    expect(
      resolveCoachVisibleErrorMessage("AI_ACCESS_REQUIRED", translate()),
    ).toBe(OPERATION_COPY.accessRequired);
    expect(
      resolveCoachVisibleErrorMessage(
        "AI_OPERATION_IN_PROGRESS",
        translate(),
      ),
    ).toBe(OPERATION_COPY.inProgress);
    expect(
      resolveCoachVisibleErrorMessage(
        "AI_OPERATION_SETTLEMENT_PENDING",
        translate(),
      ),
    ).toBe(OPERATION_COPY.settlementPending);
  });

  it("falls back to localized transcript copy for unknown machine codes", () => {
    const message = resolveCoachVisibleErrorMessage(
      "SOME_INTERNAL_MACHINE_CODE",
      translate(),
    );
    expect(message).toBe(TRANSCRIPT_COPY.reasonUnknown);
    expect(message).not.toContain("SOME_INTERNAL_MACHINE_CODE");
  });

  it("maps known non-operation terminal codes to the shared Coach catalog", () => {
    expect(resolveCoachVisibleErrorMessage("internal", translate())).toBe(
      TURN_COPY.internal,
    );
    expect(
      resolveCoachVisibleErrorMessage(
        "invalid_plan_workout_adjustment_payload",
        translate(),
      ),
    ).toBe(TURN_COPY.invalidStructuredOutput);
  });
});

describe("buildCoachTranscriptErrorItem", () => {
  it("classifies AI_MODEL_PURPOSE_UNAVAILABLE as a model-tier failure without leaking the code", () => {
    const item = buildCoachTranscriptErrorItem({
      error: new Error("AI_MODEL_PURPOSE_UNAVAILABLE"),
    });
    expect(item.reason).toBe("model_tier");
    expect(item.detail).toBeUndefined();
  });
});
