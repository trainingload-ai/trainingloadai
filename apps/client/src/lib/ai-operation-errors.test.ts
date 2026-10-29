import { describe, expect, it } from "vitest";

import { ApiFetchError } from "@/lib/api-error";
import {
  AI_OPERATION_ERROR_CODES,
  aiOperationErrorReason,
} from "@shared/ai-operation-errors";
import {
  aiOperationErrorCode,
  localizedAiOperationError,
} from "./ai-operation-errors";

describe("AI operation error mapping", () => {
  it("reads a stable operation code from common error envelopes", () => {
    expect(aiOperationErrorCode("AI_MODEL_PURPOSE_UNAVAILABLE")).toBe(
      "AI_MODEL_PURPOSE_UNAVAILABLE",
    );
    expect(aiOperationErrorCode(new Error("AI_MODEL_PURPOSE_UNAVAILABLE"))).toBe(
      "AI_MODEL_PURPOSE_UNAVAILABLE",
    );
    expect(
      aiOperationErrorCode(
        new ApiFetchError(
          "Service unavailable",
          503,
          "AI_MODEL_PURPOSE_UNAVAILABLE",
        ),
      ),
    ).toBe("AI_MODEL_PURPOSE_UNAVAILABLE");
    expect(
      aiOperationErrorCode(
        JSON.stringify({
          code: "AI_OPERATION_IN_PROGRESS",
          message: "AI_OPERATION_IN_PROGRESS",
        }),
      ),
    ).toBe("AI_OPERATION_IN_PROGRESS");
  });

  it("localizes operation failures instead of returning raw codes", () => {
    expect(
      localizedAiOperationError(
        "AI_ACCESS_REQUIRED",
        (key) => `i18n:${key}`,
      ),
    ).toBe("i18n:accessRequired");
  });

  it("classifies every public operation code", () => {
    expect(
      Object.fromEntries(
        AI_OPERATION_ERROR_CODES.map((code) => [
          code,
          aiOperationErrorReason(code),
        ]),
      ),
    ).toEqual({
      AI_ACCESS_REQUIRED: "accessRequired",
      AI_OPERATION_IN_PROGRESS: "inProgress",
      AI_OPERATION_SETTLEMENT_PENDING: "settlementPending",
      AI_MODEL_PURPOSE_UNAVAILABLE: "purposeUnavailable",
    });
  });
});
