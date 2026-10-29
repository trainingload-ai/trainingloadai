import { advertisedMonthlyCredits, formatNewUserGiftCredits, type NewUserGiftEnv } from "./offer-content";

export type PricingCreditLabels = { plus: string; pro: string };
export function getPricingCreditLabels(locale: string, env: NewUserGiftEnv = process.env): PricingCreditLabels {
  return {
    plus: formatNewUserGiftCredits(advertisedMonthlyCredits("PLUS", env), locale),
    pro: formatNewUserGiftCredits(advertisedMonthlyCredits("PRO", env), locale),
  };
}
