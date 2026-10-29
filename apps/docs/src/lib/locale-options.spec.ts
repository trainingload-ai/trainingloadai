import { describe, expect, it } from "vitest";

import { LOCALE_NATIVE_LABELS } from "@shared/locale-display-names";
import { i18n } from "@/lib/i18n";
import { LOCALE_OPTIONS } from "@/lib/locale-options";

describe("docs locale option labels", () => {
  it("renders native endonyms shared with the product client", () => {
    expect(LOCALE_OPTIONS.map((option) => option.key)).toEqual([
      ...i18n.languages,
    ]);
    expect(
      Object.fromEntries(
        LOCALE_OPTIONS.map((option) => [option.key, option.label]),
      ),
    ).toEqual(LOCALE_NATIVE_LABELS);
    expect(LOCALE_OPTIONS.map((option) => option.label)).toEqual([
      "English",
      "Deutsch",
      "Français",
      "Español",
      "Português (Brasil)",
      "Italiano",
      "한국어",
      "日本語",
      "简体中文",
      "繁體中文",
    ]);
  });
});
