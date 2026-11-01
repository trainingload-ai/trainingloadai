import { describe, expect, it } from "vitest";
import {
  appendErrorReference,
  buildToolRequestError,
} from "./tool-request-error";

describe("localized tool request errors", () => {
  it.each([
    "转换结果未通过校验",
    "Le fichier converti n’a pas pu être vérifié",
    "Die konvertierte Datei konnte nicht verifiziert werden",
  ])(
    "preserves the server translation independently of the stable error code: %s",
    async (message) => {
      const response = new Response(
        JSON.stringify({
          code: 500,
          error_code: "TRACK_FILE_OUTPUT_INVALID",
          errorCode: "LEGACY_ALIAS",
          message,
          data: { category: "CONVERSION", origin: "SERVICE" },
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
      const error = await buildToolRequestError(
        response,
        "fallback",
        "trace-1",
      );
      expect(error.message).toBe(message);
      expect(error.meta).toMatchObject({
        serverCode: "TRACK_FILE_OUTPUT_INVALID",
        errorCategory: "CONVERSION",
        errorOrigin: "SERVICE",
        clientTraceId: "trace-1",
      });
    },
  );

  it("uses a localized fallback for an upstream response without a message", async () => {
    const error = await buildToolRequestError(
      new Response("Bad gateway", { status: 502 }),
      "转换服务暂时不可用",
    );
    expect(error.message).toBe("转换服务暂时不可用");
  });

  it("localizes the reference label without changing the trace identifier", () => {
    expect(appendErrorReference("转换失败", "converter_123", "参考编号")).toBe(
      "转换失败 (参考编号: converter_123)",
    );
    expect(appendErrorReference("转换失败", undefined, "参考编号")).toBe(
      "转换失败",
    );
  });
});
