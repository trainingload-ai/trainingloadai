import { describe, expect, it } from "vitest";
import {
  localeNavigationHref,
  localeNavigationQuery,
} from "./locale-navigation";

describe("localeNavigationQuery", () => {
  it("preserves auth and onboarding return parameters", () => {
    expect(
      localeNavigationQuery(
        "?callbackURL=%2Factivities&next=%2Factivities&step=profile",
      ),
    ).toEqual({
      callbackURL: "/activities",
      next: "/activities",
      step: "profile",
    });
  });

  it("preserves repeated keys in their original order", () => {
    expect(localeNavigationQuery("?tag=first&tag=second&empty=")).toEqual({
      tag: ["first", "second"],
      empty: "",
    });
  });

  it("omits an empty query instead of appending a bare question mark", () => {
    expect(localeNavigationQuery("")).toBeUndefined();
    expect(localeNavigationQuery("?")).toBeUndefined();
  });

  it("builds a locale-prefixed URL for full-page navigation", () => {
    expect(localeNavigationHref("zh", "/activities", "?source=local")).toBe(
      "/zh/activities?source=local",
    );
    expect(localeNavigationHref("ja", "activities", "")).toBe("/ja/activities");
  });

  it("replaces an existing locale prefix instead of duplicating it", () => {
    expect(localeNavigationHref("zh", "/zh/activities", "")).toBe(
      "/zh/activities",
    );
    expect(localeNavigationHref("ja", "/zh/activities", "?source=local")).toBe(
      "/ja/activities?source=local",
    );
    expect(localeNavigationHref("zh", "/pt-BR/activities", "")).toBe(
      "/zh/activities",
    );
  });
});
