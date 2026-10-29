import { describe, expect, it } from "vitest";

import {
  buildCoachTurnErrorItem,
  isCoachTurnErrorEchoText,
  readCoachTurnError,
  shouldOfferCoachModelSwitch,
  shouldOfferCoachRetry,
} from "./coach-turn-error-model";

describe("coach turn error model", () => {
  it("reads the failure part from the read-only Coach message view", () => {
    expect(
      readCoachTurnError([
        { type: "text", text: "partial" },
        {
          type: "data",
          name: "coach-turn-error",
          data: { code: "model_unavailable", message: "模型暂时无法响应" },
        },
      ]),
    ).toEqual({ code: "model_unavailable", message: "模型暂时无法响应" });
    expect(
      readCoachTurnError([
        { type: "data", name: "coach-tool", data: { code: "x" } },
        { type: "text", text: "hi" },
      ]),
    ).toBeNull();
  });

  it("hides only the persisted echo of the failure text", () => {
    const turnError = {
      code: "model_unavailable",
      message: "模型暂时无法响应",
    };
    expect(isCoachTurnErrorEchoText(" 模型暂时无法响应 ", turnError)).toBe(
      true,
    );
    expect(isCoachTurnErrorEchoText("这是已生成的一部分回答", turnError)).toBe(
      false,
    );
    expect(isCoachTurnErrorEchoText("模型暂时无法响应", null)).toBe(false);
    expect(isCoachTurnErrorEchoText("", { code: "model_unavailable" })).toBe(
      false,
    );
  });

  it("offers a model switch only for model failures", () => {
    expect(shouldOfferCoachModelSwitch({ code: "model_unavailable" })).toBe(
      true,
    );
    expect(shouldOfferCoachModelSwitch({ code: "internal" })).toBe(false);
    expect(
      shouldOfferCoachModelSwitch({ code: "AI_CREDITS_INSUFFICIENT" }),
    ).toBe(false);
  });

  it.each([
    "AI_ACCESS_REQUIRED",
    "AI_MODEL_PURPOSE_UNAVAILABLE",
  ])("does not offer a futile retry for %s", (code) => {
    expect(shouldOfferCoachRetry({ code })).toBe(false);
  });

  it.each([
    "model_unavailable",
    "internal",
    "AI_OPERATION_IN_PROGRESS",
    "AI_OPERATION_SETTLEMENT_PENDING",
  ])("allows retry when %s can recover without an account change", (code) => {
    expect(shouldOfferCoachRetry({ code })).toBe(true);
  });

  it("maps model failures to the dedicated card copy", () => {
    expect(
      buildCoachTurnErrorItem(
        { code: "model_unavailable", message: "server text" },
        "m1",
      ),
    ).toEqual({ id: "m1", type: "turn_failed", reason: "model_unavailable" });
  });

  it("maps operation codes to transcript reasons, never showing raw codes", () => {
    expect(
      buildCoachTurnErrorItem(
        { code: "AI_ACCESS_REQUIRED", message: "AI_ACCESS_REQUIRED" },
        "m1",
        { localizeOperationCode: () => "AI access is unavailable." },
      ),
    ).toEqual({
      id: "m1",
      type: "turn_failed",
      reason: "access_required",
      message: "AI access is unavailable.",
    });
    expect(
      buildCoachTurnErrorItem(
        {
          code: "AI_OPERATION_IN_PROGRESS",
          message: "AI_OPERATION_IN_PROGRESS",
        },
        "m1",
        { localizeOperationCode: () => "Another AI action is running." },
      ),
    ).toEqual({
      id: "m1",
      type: "turn_failed",
      reason: "action_in_progress",
      message: "Another AI action is running.",
    });
  });

  it("uses the shared localized category for other failures", () => {
    expect(
      buildCoachTurnErrorItem(
        {
          code: "unsafe_ai_output_blocked",
          message: "本次回答生成异常，请重试。",
        },
        "m1",
        { localizeTurnError: () => "本次回答无法安全展示，请重新生成。" },
      ),
    ).toEqual({
      id: "m1",
      type: "turn_failed",
      reason: "unknown",
      message: "本次回答无法安全展示，请重新生成。",
    });
  });

  it("never shows a machine-code echo as user copy", () => {
    expect(
      buildCoachTurnErrorItem(
        { code: "internal", message: "internal" },
        "m1",
      ),
    ).toEqual({ id: "m1", type: "turn_failed", reason: "unknown" });
    expect(
      buildCoachTurnErrorItem(
        { code: "unexpected", message: "SOME_INTERNAL_MACHINE_CODE" },
        "m2",
      ),
    ).toEqual({ id: "m2", type: "turn_failed", reason: "unknown" });
  });
});
