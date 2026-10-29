import { describe, expect, it } from "vitest";

import {
  buildLocaleSuggestionHref,
  getSuggestedLocale,
} from "@/lib/locale-suggestion";

describe("browser language suggestions", () => {
  it.each([
    ["zh-CN", "zh"],
    ["zh-SG", "zh"],
    ["zh-Hans", "zh"],
    ["zh", "zh"],
    ["zh-TW", "zh-hant"],
    ["zh-HK", "zh-hant"],
    ["zh-MO", "zh-hant"],
    ["zh-Hant", "zh-hant"],
    ["zh-Hans-TW", "zh"],
    ["ZH_hant_HK", "zh-hant"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["de-DE", "de"],
    ["fr-CA", "fr"],
    ["es-MX", "es"],
    ["pt-PT", "pt-BR"],
    ["it-IT", "it"],
  ])("matches %s to %s", (language, expected) => {
    expect(getSuggestedLocale([language], "en")).toBe(expected);
  });

  it("respects the first supported browser preference", () => {
    expect(getSuggestedLocale(["ar", "ja-JP", "zh-CN"], "en")).toBe("ja");
    expect(getSuggestedLocale(["en-US", "zh-CN"], "en")).toBeNull();
    expect(getSuggestedLocale(["zh-TW", "en"], "zh-hant")).toBeNull();
    expect(getSuggestedLocale(["en-GB"], "zh")).toBe("en");
  });

  it("ignores unsupported and malformed preferences", () => {
    expect(getSuggestedLocale([], "en")).toBeNull();
    expect(getSuggestedLocale(["", "not a locale", "ar"], "en")).toBeNull();
    expect(getSuggestedLocale(["invalid!", "zh-CN"], "en")).toBe("zh");
  });

  it("keeps the current page, query and anchor when switching languages", () => {
    expect(
      buildLocaleSuggestionHref(
        "/docs/workflow",
        "zh",
        "?utm_source=directory",
        "#training-loop",
      ),
    ).toBe("/zh/docs/workflow?utm_source=directory#training-loop");
    expect(buildLocaleSuggestionHref("/zh-hant/docs/metrics", "en")).toBe(
      "/docs/metrics",
    );
    expect(buildLocaleSuggestionHref("/", "ja")).toBe("/ja");
  });
});
