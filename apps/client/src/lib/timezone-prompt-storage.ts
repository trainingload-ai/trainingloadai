import { getBrowserLocalStorage } from "@/lib/browser-storage";

export const TIMEZONE_PROFILE_PROMPT_SNOOZE_KEY = "timezoneProfilePromptSnoozedAt";

/** 点击「暂不更新」后，30 天内不再请求接口 / 弹窗 */
export const TIMEZONE_PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function isTimezoneProfilePromptSnoozed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = getBrowserLocalStorage().getItem(
      TIMEZONE_PROFILE_PROMPT_SNOOZE_KEY,
    );
    if (!raw) return false;
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < TIMEZONE_PROMPT_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozeTimezoneProfilePrompt(): void {
  try {
    getBrowserLocalStorage().setItem(
      TIMEZONE_PROFILE_PROMPT_SNOOZE_KEY,
      new Date().toISOString(),
    );
  } catch {
    /* ignore */
  }
}

export function clearTimezoneProfilePromptSnooze(): void {
  try {
    getBrowserLocalStorage().removeItem(TIMEZONE_PROFILE_PROMPT_SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}
