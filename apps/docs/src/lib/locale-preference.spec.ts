import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dismissLocaleSuggestion,
  hasDismissedLocaleSuggestion,
  LOCALE_COOKIE_NAME,
  LOCALE_SUGGESTION_COOKIE_NAME,
  persistLocalePreference,
} from "@/lib/locale-preference";
import { getSuggestedLocale } from "@/lib/locale-suggestion";

afterEach(() => vi.unstubAllGlobals());

function browserCookies(storageBlocked = false) {
  const cookies = new Map<string, string>();
  const writes: string[] = [];
  vi.stubGlobal("document", {
    get cookie() {
      return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(value: string) {
      writes.push(value);
      const [name, content] = value.split(";")[0].split("=");
      cookies.set(name, content);
    },
  });
  vi.stubGlobal("window", {
    localStorage: {
      setItem: () => {
        if (storageBlocked) throw new Error("Storage unavailable");
      },
    },
  });
  return { cookies, writes };
}

describe("remembering language suggestions", () => {
  it("does not count a page visit as dismissing a suggestion", () => {
    const { cookies } = browserCookies();
    persistLocalePreference("en");
    expect(cookies.get(LOCALE_COOKIE_NAME)).toBe("en");
    expect(hasDismissedLocaleSuggestion()).toBe(false);
  });

  it("remembers dismissal for 30 days without changing the page language", () => {
    const { cookies, writes } = browserCookies();
    dismissLocaleSuggestion();
    expect(hasDismissedLocaleSuggestion()).toBe(true);
    expect(cookies.has(LOCALE_COOKIE_NAME)).toBe(false);
    expect(writes[0]).toContain("Max-Age=2592000; SameSite=Lax");
  });

  it("still suggests Chinese after manually switching to English and refreshing", () => {
    const { cookies } = browserCookies();
    persistLocalePreference("zh");
    persistLocalePreference("en");
    // LocalePreferenceSync repeats this write when the English page reloads.
    persistLocalePreference("en");
    expect(cookies.get(LOCALE_COOKIE_NAME)).toBe("en");
    expect(hasDismissedLocaleSuggestion()).toBe(false);
    expect(getSuggestedLocale(["zh-CN", "en"], "en")).toBe("zh");
  });

  it("ignores legacy dismissal cookies that could come from a language change", () => {
    const { cookies } = browserCookies();
    cookies.set(LOCALE_SUGGESTION_COOKIE_NAME, "1");
    persistLocalePreference("en");
    expect(hasDismissedLocaleSuggestion()).toBe(false);
    dismissLocaleSuggestion();
    expect(hasDismissedLocaleSuggestion()).toBe(true);
  });

  it("keeps an actual dismissal when the language changes", () => {
    const { cookies } = browserCookies();
    dismissLocaleSuggestion();
    persistLocalePreference("en");
    expect(cookies.get(LOCALE_COOKIE_NAME)).toBe("en");
    expect(hasDismissedLocaleSuggestion()).toBe(true);
  });

  it("still switches and remembers the choice if local storage is blocked", () => {
    const { cookies } = browserCookies(true);
    expect(() => persistLocalePreference("ja")).not.toThrow();
    expect(cookies.get(LOCALE_COOKIE_NAME)).toBe("ja");
    expect(hasDismissedLocaleSuggestion()).toBe(false);
  });

  it("is safe during server rendering", () => {
    expect(hasDismissedLocaleSuggestion()).toBe(false);
    expect(() => dismissLocaleSuggestion()).not.toThrow();
    expect(() => persistLocalePreference("en")).not.toThrow();
  });
});
