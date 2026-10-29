import { describe, expect, it } from "vitest";
import type { CoachSessionListItem } from "@/api/ai-coach";
import {
  excludeEmptyCoachHistorySessions,
  getCoachHistoryLineText,
  getCoachHistoryReplyPreview,
  isEmptyCoachHistorySession,
} from "./coach-history-list-model";

function session(
  overrides: Partial<CoachSessionListItem> = {},
): CoachSessionListItem {
  return {
    id: "sid-1",
    title: null,
    updatedAt: "2026-09-19T07:57:26.000Z",
    pinnedAt: null,
    lastMessagePreview: null,
    lastReplyPreview: null,
    ...overrides,
  };
}

describe("isEmptyCoachHistorySession", () => {
  it("treats title-less zero-preview shells as empty", () => {
    expect(isEmptyCoachHistorySession(session())).toBe(true);
    expect(
      isEmptyCoachHistorySession(
        session({ title: "   ", lastMessagePreview: "" }),
      ),
    ).toBe(true);
  });

  it("keeps sessions that have a title or message preview", () => {
    expect(isEmptyCoachHistorySession(session({ title: "FTP" }))).toBe(false);
    expect(
      isEmptyCoachHistorySession(
        session({ lastMessagePreview: "我昨日练成点？" }),
      ),
    ).toBe(false);
  });
});

describe("excludeEmptyCoachHistorySessions", () => {
  it("drops shells that would render as the untitled 「新對話」 label", () => {
    const items = [
      session({ id: "empty" }),
      session({ id: "real", title: "你好吗" }),
    ];
    expect(
      excludeEmptyCoachHistorySessions(items).map((item) => item.id),
    ).toEqual(["real"]);
  });
});

describe("getCoachHistoryLineText", () => {
  it("falls back to the untitled label for empty shells", () => {
    expect(getCoachHistoryLineText(session(), "新對話")).toBe("新對話");
  });
});

describe("getCoachHistoryReplyPreview", () => {
  it("prefers the last assistant reply", () => {
    expect(
      getCoachHistoryReplyPreview(
        session({
          title: "现在正常吗",
          lastMessagePreview: "现在正常吗",
          lastReplyPreview: "目前恢复正常，可以按计划训练。",
        }),
      ),
    ).toBe("目前恢复正常，可以按计划训练。");
  });

  it("falls back to the last message when it is not the title", () => {
    expect(
      getCoachHistoryReplyPreview(
        session({
          title: "FTP",
          lastMessagePreview: "我现在的 FTP 是多少呢",
        }),
      ),
    ).toBe("我现在的 FTP 是多少呢");
  });

  it("does not repeat the title when the only preview is the user message", () => {
    expect(
      getCoachHistoryReplyPreview(
        session({
          title: "现在正常吗",
          lastMessagePreview: "现在正常吗",
        }),
      ),
    ).toBeNull();
  });

  it("collapses whitespace in the reply preview", () => {
    expect(
      getCoachHistoryReplyPreview(
        session({
          lastReplyPreview: "第一行\n\n第二行   继续",
        }),
      ),
    ).toBe("第一行 第二行 继续");
  });
});
