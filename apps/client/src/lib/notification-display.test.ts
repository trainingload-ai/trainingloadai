import { describe, expect, it } from "vitest";
import type { NotificationItem } from "@/api/notifications";
import { resolveNotificationDisplay } from "./notification-display";

describe("resolveNotificationDisplay", () => {
  it("renders an import result as an actionable activity outcome without duplicate zero counts", () => {
    const item: NotificationItem = {
      id: "notification-import-1",
      kind: "IMPORT_BATCH_COMPLETED",
      title: "Import completed",
      bodyMarkdown: "server body",
      data: {
        totalCount: 73,
        successCount: 73,
        failedCount: 0,
        skippedCount: 0,
      },
      createdAt: "2026-11-05T09:24:08.000Z",
    };
    const display = resolveNotificationDisplay(item, (key, values) => {
      const translations: Record<string, string> = {
        "templates.importResult": "导入结果",
        "summary.available": "可用活动",
        "summary.failed": "失败",
        "summary.skipped": "跳过",
        viewActivities: "查看活动",
      };
      if (key === "kinds.IMPORT_BATCH_COMPLETED.title") {
        return `${values?.success} 个活动已可用`;
      }
      if (key === "kinds.IMPORT_BATCH_COMPLETED.body") {
        return "文件解析、活动分析和训练负荷更新均已完成。";
      }
      if (key === "kinds.IMPORT_BATCH_COMPLETED.preview") {
        return "解析、分析和负荷更新均已完成";
      }
      return translations[key] ?? key;
    });

    expect(display.title).toBe("73 个活动已可用");
    expect(display.summary).toEqual([
      { label: "可用活动", value: "73", tone: "success" },
    ]);
    expect(display.actionHref).toBe("/activities");
    expect(display.actionLabel).toBe("查看活动");
  });

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
