"use client";

import dayjs from "dayjs";
import type { CoachSessionListItem } from "@/api/ai-coach";

export type CoachHistoryFlatRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "session"; key: string; session: CoachSessionListItem };

export function groupUnpinnedCoachSessionsByDay(
  sessions: CoachSessionListItem[],
  dayLabel: (dayKey: string) => string,
): CoachHistoryFlatRow[] {
  const byDay = new Map<string, CoachSessionListItem[]>();

  for (const session of sessions) {
    const day = dayjs(session.updatedAt).format("YYYY-MM-DD");
    const items = byDay.get(day) ?? [];
    items.push(session);
    byDay.set(day, items);
  }

  const dayKeys = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const rows: CoachHistoryFlatRow[] = [];

  for (const day of dayKeys) {
    rows.push({ kind: "header", key: `h-${day}`, label: dayLabel(day) });
    const items = byDay.get(day) ?? [];
    items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    for (const session of items) {
      rows.push({ kind: "session", key: session.id, session });
    }
  }

  return rows;
}

export function groupCoachSessionsByRecentBuckets(
  sessions: CoachSessionListItem[],
  labels: {
    today: string;
    yesterday: string;
    past: string;
  },
): CoachHistoryFlatRow[] {
  const today = dayjs().startOf("day");
  const yesterday = today.subtract(1, "day");
  const buckets: Array<{
    key: "today" | "yesterday" | "past";
    label: string;
    items: CoachSessionListItem[];
  }> = [
    { key: "today", label: labels.today, items: [] },
    { key: "yesterday", label: labels.yesterday, items: [] },
    { key: "past", label: labels.past, items: [] },
  ];

  for (const session of sessions) {
    const updatedAt = dayjs(session.updatedAt).startOf("day");
    if (updatedAt.isSame(today, "day")) {
      buckets[0].items.push(session);
    } else if (updatedAt.isSame(yesterday, "day")) {
      buckets[1].items.push(session);
    } else {
      buckets[2].items.push(session);
    }
  }

  const rows: CoachHistoryFlatRow[] = [];
  for (const bucket of buckets) {
    if (bucket.items.length === 0) continue;
    rows.push({
      kind: "header",
      key: `section-${bucket.key}`,
      label: bucket.label,
    });
    bucket.items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    for (const session of bucket.items) {
      rows.push({ kind: "session", key: session.id, session });
    }
  }

  return rows;
}

export function groupCoachSessionsByHistoryBuckets(
  sessions: CoachSessionListItem[],
  labels: {
    today: string;
    yesterday: string;
    last7Days: string;
    last30Days: string;
    month: (date: dayjs.Dayjs) => string;
  },
): CoachHistoryFlatRow[] {
  const today = dayjs().startOf("day");
  const yesterday = today.subtract(1, "day");
  const sevenDaysAgo = today.subtract(7, "day");
  const thirtyDaysAgo = today.subtract(30, "day");
  const buckets = new Map<
    string,
    { label: string; items: CoachSessionListItem[] }
  >();
  const order: string[] = [];

  function push(key: string, label: string, session: CoachSessionListItem) {
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(session);
      return;
    }
    buckets.set(key, { label, items: [session] });
    order.push(key);
  }

  const sorted = sessions
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  for (const session of sorted) {
    const updatedAt = dayjs(session.updatedAt).startOf("day");
    if (updatedAt.isSame(today, "day")) {
      push("today", labels.today, session);
    } else if (updatedAt.isSame(yesterday, "day")) {
      push("yesterday", labels.yesterday, session);
    } else if (updatedAt.isAfter(sevenDaysAgo)) {
      push("last-7-days", labels.last7Days, session);
    } else if (updatedAt.isAfter(thirtyDaysAgo)) {
      push("last-30-days", labels.last30Days, session);
    } else {
      const monthKey = updatedAt.format("YYYY-MM");
      push(`month-${monthKey}`, labels.month(updatedAt), session);
    }
  }

  const rows: CoachHistoryFlatRow[] = [];
  for (const key of order) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.items.length === 0) continue;
    rows.push({ kind: "header", key: `section-${key}`, label: bucket.label });
    for (const session of bucket.items) {
      rows.push({ kind: "session", key: session.id, session });
    }
  }

  return rows;
}

export function buildCoachHistoryFlatRows(args: {
  dayLabel: (dayKey: string) => string;
  pinnedSectionLabel: string;
  sessions: CoachSessionListItem[];
}): CoachHistoryFlatRow[] {
  const pinned = args.sessions
    .filter((session) => session.pinnedAt)
    .sort(
      (a, b) =>
        new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime(),
    );
  const unpinned = args.sessions.filter((session) => !session.pinnedAt);

  const rows: CoachHistoryFlatRow[] = [];
  if (pinned.length > 0) {
    rows.push({
      kind: "header",
      key: "section-pinned",
      label: args.pinnedSectionLabel,
    });
    for (const session of pinned) {
      rows.push({ kind: "session", key: session.id, session });
    }
  }

  rows.push(...groupUnpinnedCoachSessionsByDay(unpinned, args.dayLabel));
  return rows;
}

const MACHINE_TEXT_KINDS = new Set([
  "coach_question_reply_text",
  "coach_question_skip_text",
  "coach_plan_draft_saved",
  "plan_workout_adjustment_applied",
]);

function cleanCoachHistoryText(
  value: string | null | undefined,
): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (!text.startsWith("{") || !text.endsWith("}")) return text;

  try {
    const parsed = JSON.parse(text) as { kind?: unknown };
    const kind = typeof parsed?.kind === "string" ? parsed.kind : "";
    if (MACHINE_TEXT_KINDS.has(kind)) return null;
  } catch {
    return text;
  }

  return text;
}

export function getCoachHistoryLineText(
  session: CoachSessionListItem,
  untitledLabel: string,
) {
  return (
    cleanCoachHistoryText(session.title) ||
    cleanCoachHistoryText(session.lastMessagePreview) ||
    cleanCoachHistoryText(session.lastReplyPreview) ||
    untitledLabel
  );
}

function collapseCoachHistoryPreview(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 历史卡片用的助手回复预览：优先 lastReplyPreview，
 * 否则用 lastMessagePreview（且避免和标题完全重复）。
 */
export function getCoachHistoryReplyPreview(
  session: Pick<
    CoachSessionListItem,
    "title" | "lastMessagePreview" | "lastReplyPreview"
  >,
): string | null {
  const reply = cleanCoachHistoryText(session.lastReplyPreview);
  if (reply) return collapseCoachHistoryPreview(reply);

  const message = cleanCoachHistoryText(session.lastMessagePreview);
  if (!message) return null;

  const title = cleanCoachHistoryText(session.title);
  if (title && message === title) return null;
  return collapseCoachHistoryPreview(message);
}

/**
 * 首条发送失败留下的空壳：无标题、无预览。
 * 历史文案会回退成和「新对话」按钮一样的 untitled，造成选中态错觉。
 */
export function isEmptyCoachHistorySession(
  session: Pick<
    CoachSessionListItem,
    "title" | "lastMessagePreview" | "lastReplyPreview"
  >,
): boolean {
  return (
    !cleanCoachHistoryText(session.title) &&
    !cleanCoachHistoryText(session.lastMessagePreview) &&
    !cleanCoachHistoryText(session.lastReplyPreview)
  );
}

export function excludeEmptyCoachHistorySessions<
  T extends CoachSessionListItem,
>(sessions: T[]): T[] {
  return sessions.filter((session) => !isEmptyCoachHistorySession(session));
}
