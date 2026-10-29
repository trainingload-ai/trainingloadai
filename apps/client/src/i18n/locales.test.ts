import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  LOCALE_NATIVE_LABELS,
  localeNativeLabel,
} from "@shared/locale-display-names";
import { SUPPORTED_LOCALES } from "./locales";

const EXPECTED_NATIVE_LABELS = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
  ko: "한국어",
  ja: "日本語",
  zh: "简体中文",
  "zh-hant": "繁體中文",
} as const;

const MESSAGES_DIR = path.resolve(
  __dirname,
  "../../../../packages/messages/client-core",
);

describe("locale native labels", () => {
  it("covers every supported locale with a stable endonym", () => {
    expect([...SUPPORTED_LOCALES]).toEqual(Object.keys(EXPECTED_NATIVE_LABELS));
    expect(LOCALE_NATIVE_LABELS).toEqual(EXPECTED_NATIVE_LABELS);
  });

  it("resolves the same endonym regardless of any UI locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(localeNativeLabel(locale)).toBe(EXPECTED_NATIVE_LABELS[locale]);
    }
    expect(localeNativeLabel("unknown")).toBe("unknown");
  });

  it("does not keep language names in LocaleSwitcher message strings", () => {
    const localeFiles = readdirSync(MESSAGES_DIR).filter((file) =>
      file.endsWith(".json"),
    );
    expect(localeFiles.length).toBeGreaterThan(0);

    for (const file of localeFiles) {
      const messages = JSON.parse(
        readFileSync(path.join(MESSAGES_DIR, file), "utf8"),
      ) as Record<string, unknown>;
      expect(messages, file).not.toHaveProperty("LocaleSwitcher");
    }
  });
});
