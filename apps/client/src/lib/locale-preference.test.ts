import { describe, expect, it } from "vitest";

import { resolveRequestLocale } from "./locale-preference";

describe("resolveRequestLocale", () => {
  it("prefers an explicit query locale", () => {
    expect(
      resolveRequestLocale({
        queryLocale: "zh",
        cookieLocale: "en",
        acceptLanguage: "fr",
      }),
    ).toBe("zh");
  });

  it("falls back from cookie to Accept-Language", () => {
    expect(
      resolveRequestLocale({
        cookieLocale: "ja",
        acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
      }),
    ).toBe("ja");
    expect(
      resolveRequestLocale({
        acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
      }),
    ).toBe("zh");
    expect(
      resolveRequestLocale({
        acceptLanguage: "zh-TW,zh;q=0.8",
      }),
    ).toBe("zh-hant");
  });

  it("maps Portuguese tags to pt-BR and ignores unknown values", () => {
    expect(resolveRequestLocale({ acceptLanguage: "pt-PT" })).toBe("pt-BR");
    expect(
      resolveRequestLocale({
        queryLocale: "not-a-locale",
        cookieLocale: "also-bad",
        acceptLanguage: "*",
      }),
    ).toBe("en");
  });
});
