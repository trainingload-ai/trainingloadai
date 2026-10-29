import { describe, expect, it } from "vitest";
import { getActiveMobileTab, isMobileTabRoot } from "./mobile-route-model";

describe("mobile route model", () => {
  it.each([
    ["/", "today"],
    ["/plan", "plan"],
    ["/plans", "plan"],
    ["/ai-coach", "coach"],
    ["/calendar", "calendar"],
    ["/metrics/power", "today"],
    ["/activities", "me"],
    ["/account", "me"],
  ] as const)("maps %s to %s", (pathname, expected) => {
    expect(getActiveMobileTab(pathname)).toBe(expected);
  });

  it("only marks the five primary destinations as roots", () => {
    expect(isMobileTabRoot("/me")).toBe(true);
    expect(isMobileTabRoot("/notifications")).toBe(false);
  });
});
