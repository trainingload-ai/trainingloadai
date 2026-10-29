import { describe, expect, it } from "vitest";

import {
  NEW_USER_GIFT_DEFAULTS,
  formatNewUserGiftCredits,
  newUserGiftValues,
} from "@/lib/offer-content";

describe("new-user gift configuration", () => {
  it("reads the deployment values used by the server and marketing site", () => {
    expect(
      newUserGiftValues({
        NEW_USER_GIFT_ACCESS_DAYS: "14",
        NEW_USER_GIFT_BONUS_CREDITS: "1000",
      }),
    ).toEqual({
      accessDays: 14,
      bonusCredits: 1_000,
    });
  });

  it("falls back for missing or invalid values", () => {
    expect(
      newUserGiftValues({
        NEW_USER_GIFT_ACCESS_DAYS: "0",
        NEW_USER_GIFT_BONUS_CREDITS: "invalid",
      }),
    ).toEqual(NEW_USER_GIFT_DEFAULTS);
  });

  it("formats credit quantities for the current locale", () => {
    expect(formatNewUserGiftCredits(1_000, "en")).toBe("1,000");
    expect(formatNewUserGiftCredits(1_000, "zh")).toBe("1,000");
  });
});
