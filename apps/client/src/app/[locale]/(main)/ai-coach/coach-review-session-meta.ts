import type { Dayjs } from "dayjs";
import type { CoachSessionListItem } from "@/api/ai-coach";
import { dayjs } from "@/lib/dayjs-tz";

export type ReviewScope = "daily" | "weekly" | "monthly";

/** ISO 瞬间转到用户时区的 wall time（复盘周期边界来自服务端 UTC） */
export function instantInUserTz(
  iso: string | null | undefined,
  timeZone: string,
): Dayjs | null {
  if (!iso) return null;
  try {
    return dayjs.utc(iso).tz(timeZone);
  } catch {
    try {
      return dayjs(iso).tz(timeZone);
    } catch {
      return null;
    }
  }
}

export function extractDateText(session: CoachSessionListItem): string | null {
  const text = [
    session.title,
    session.lastReplyPreview,
    session.lastMessagePreview,
  ]
    .filter(Boolean)
    .join(" ");
  const m = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return m?.[1] ?? null;
}

export function resolveReviewDate(
  scope: ReviewScope,
  session: CoachSessionListItem | undefined,
  timeZone: string,
): string | null {
  if (!session?.updatedAt) return null;
  const parsed = extractDateText(session);
  if (parsed) return parsed;
  const at = instantInUserTz(session.updatedAt, timeZone);
  if (!at) return null;
  if (scope === "daily" && (session.id ?? "").startsWith("review-digest-")) {
    return at.subtract(1, "day").format("YYYY-MM-DD");
  }
  return at.format("YYYY-MM-DD");
}

/** 列表行主标题：与日/周/月卡片口径一致（日期均在用户档案时区下解释） */
export function formatReviewSessionListPrimaryLine(
  scope: ReviewScope,
  session: CoachSessionListItem,
  locale: string,
  timeZone: string,
): string {
  const ps = session.periodStart ?? null;
  const pe = session.periodEnd ?? null;

  if (scope === "weekly" && ps && pe) {
    const start = instantInUserTz(ps, timeZone);
    if (!start) return session.title?.trim() || "—";
    const w = start.isoWeek();
    const y = start.isoWeekYear();
    if (locale.startsWith("en")) return `W${w} · ${y}`;
    if (locale.startsWith("ja")) return `${y}年・第${w}週`;
    if (locale === "zh-hant") return `${y}年第${w}週`;
    if (locale.startsWith("zh")) return `${y}年第${w}周`;
    return `${y}-W${String(w).padStart(2, "0")}`;
  }

  if (scope === "monthly" && ps && pe) {
    const monthStart = instantInUserTz(ps, timeZone);
    if (!monthStart) return session.title?.trim() || "—";
    if (locale.startsWith("en")) return monthStart.format("MMMM YYYY");
    if (locale.startsWith("ja"))
      return `${monthStart.format("YYYY")}年${monthStart.month() + 1}月`;
    if (locale.toLowerCase().startsWith("zh")) {
      return `${monthStart.format("YYYY")}年${monthStart.month() + 1}月`;
    }
    return monthStart.format("YYYY-MM");
  }

  const d = resolveReviewDate(scope, session, timeZone);
  if (d) return d;
  return session.title?.trim() || "—";
}
