/** Publicly advertised offer copy. No entitlement checks or credit settlement. */
export type NewUserGiftEnv = Readonly<Record<string, unknown>>;
export type NewUserGiftValues = { accessDays: number; bonusCredits: number };
export const NEW_USER_GIFT_DEFAULTS = { accessDays: 30, bonusCredits: 1_000 } as const;
export const PUBLIC_MONTHLY_CREDITS = { PLUS: 4_000, PRO: 10_000 } as const;

function positiveNumber(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
export function newUserGiftValues(env: NewUserGiftEnv = {}): NewUserGiftValues {
  return {
    accessDays: positiveNumber(env.NEW_USER_GIFT_ACCESS_DAYS, NEW_USER_GIFT_DEFAULTS.accessDays),
    bonusCredits: positiveNumber(env.NEW_USER_GIFT_BONUS_CREDITS, NEW_USER_GIFT_DEFAULTS.bonusCredits),
  };
}
export function formatNewUserGiftCredits(amount: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(amount)));
}
export function advertisedMonthlyCredits(plan: keyof typeof PUBLIC_MONTHLY_CREDITS, env: NewUserGiftEnv = {}) {
  return positiveNumber(env[`AI_PLAN_${plan}_MONTHLY_CREDITS`], PUBLIC_MONTHLY_CREDITS[plan]);
}
