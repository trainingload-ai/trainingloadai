import { describe, expect, it } from "vitest";
import type { NotificationItem } from "@/api/notifications";
import { resolveNotificationDisplay } from "./notification-display";

describe("resolveNotificationDisplay", () => {
  it("renders a review title from the current UI locale instead of stored text", () => {
    const item: NotificationItem = {
      id: "notification-1",
      kind: "REVIEW_DIGEST",
      title: "Daily review is ready",
      bodyMarkdown: "## 中文复盘",
      data: { type: "DAILY" },
      createdAt: "2026-08-05T00:00:00.000Z",
    };
    const translations: Record<string, string> = {
      "reviewReadyTitles.DAILY": "日复盘已生成",
      "templates.reviewDigest": "训练复盘",
      "summary.reviewType": "复盘类型",
      "reviewTypes.DAILY": "日复盘",
      openReview: "查看复盘",
    };

    const display = resolveNotificationDisplay(
      item,
      (key) => translations[key] ?? key,
    );

    expect(display.title).toBe("日复盘已生成");
    expect(display.bodyMarkdown).toBe("## 中文复盘");
  });

  it("renders plan review notifications as review digests", () => {
    const item: NotificationItem = {
      id: "notification-plan-1",
      kind: "REVIEW_DIGEST",
      title: "Plan review is ready",
      bodyMarkdown: "- Completion: 84%",
      data: { type: "PLAN", planId: "plan-1" },
      createdAt: "2026-08-17T00:00:00.000Z",
    };
    const translations: Record<string, string> = {
      "reviewReadyTitles.PLAN": "计划复盘已生成",
      "templates.reviewDigest": "训练复盘",
      "summary.reviewType": "复盘类型",
      "reviewTypes.PLAN": "计划复盘",
      openReview: "查看复盘",
    };

    const display = resolveNotificationDisplay(
      item,
      (key) => translations[key] ?? key,
    );

    expect(display.title).toBe("计划复盘已生成");
    expect(display.summary[0]?.value).toBe("计划复盘");
  });

  it("renders provider-neutral export-failure copy from kind data", () => {
    const item: NotificationItem = {
      id: "notification-export-1",
      kind: "THIRD_PARTY_EXPORT_FAILED",
      title: "同步失败",
      bodyMarkdown: "server body",
      data: {
        provider: "provider-a",
        activityId: 2520,
        hashId: "abc123",
        activityName: "门头沟区 跑步",
        sourceLabel: "Intervals.icu",
        hasHeartRate: true,
        errorClass: "external_upload_5xx_html",
        failureAt: "2026-09-19T00:00:00.000Z",
      },
      createdAt: "2026-09-19T00:00:00.000Z",
    };
    const translations: Record<string, string> = {
      "kinds.THIRD_PARTY_EXPORT_FAILED.title": "未能同步到外部服务",
      "kinds.THIRD_PARTY_EXPORT_FAILED.body":
        "这次想把活动从 **Intervals.icu** 同步到 **provider-a**，但没有成功。",
      "kinds.THIRD_PARTY_EXPORT_FAILED.preview":
        "Intervals.icu → provider-a · 「门头沟区 跑步」",
      "templates.exportFailed": "同步失败",
      "summary.exportRoute": "同步",
    };

    const display = resolveNotificationDisplay(item, (key, values) => {
      if (key === "kinds.THIRD_PARTY_EXPORT_FAILED.body") {
        return `这次想把活动从 **${values?.sourceLabel}** 同步到 **${values?.provider}**，但没有成功。`;
      }
      if (key === "kinds.THIRD_PARTY_EXPORT_FAILED.preview") {
        return `${values?.sourceLabel} → ${values?.provider} · 「${values?.activityName}」`;
      }
      return translations[key] ?? key;
    });

    expect(display.title).toBe("未能同步到外部服务");
    expect(display.tone).toBe("warning");
    expect(display.preview).toBe(
      "Intervals.icu → provider-a · 「门头沟区 跑步」",
    );
    expect(display.bodyMarkdown).toContain("Intervals.icu");
    expect(display.summary[0]?.value).toBe("Intervals.icu → provider-a");
  });
});
