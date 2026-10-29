import type { NotificationItem } from "@/api/notifications";

type ImportBatchData = {
  batchJobId?: string;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
  skippedCount?: number;
};

type ReviewDigestData = {
  type?: "DAILY" | "WEEKLY" | "MONTHLY" | "PLAN";
  periodStart?: string;
  periodEnd?: string;
};

export type NotificationTone = "success" | "warning" | "insight" | "neutral";

export type NotificationSummaryItem = {
  label: string;
  value: string;
  tone?: NotificationTone;
};

export type NotificationDisplay = {
  title: string;
  bodyMarkdown: string | null | undefined;
  preview?: string;
  eyebrow: string;
  tone: NotificationTone;
  summary: NotificationSummaryItem[];
  actionLabel?: string;
};

export type ThirdPartyExportFailedData = {
  provider?: string;
  activityId?: number;
  hashId?: string;
  activityName?: string;
  sourceLabel?: string;
  hasHeartRate?: boolean;
  errorClass?: string;
  failureAt?: string;
};

export function parseThirdPartyExportFailedData(
  data: unknown,
): ThirdPartyExportFailedData {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  return {
    provider: typeof d.provider === "string" ? d.provider : undefined,
    activityId:
      typeof d.activityId === "number" && Number.isFinite(d.activityId)
        ? d.activityId
        : undefined,
    hashId: typeof d.hashId === "string" ? d.hashId : undefined,
    activityName:
      typeof d.activityName === "string" ? d.activityName : undefined,
    sourceLabel: typeof d.sourceLabel === "string" ? d.sourceLabel : undefined,
    hasHeartRate: d.hasHeartRate === true,
    errorClass: typeof d.errorClass === "string" ? d.errorClass : undefined,
    failureAt: typeof d.failureAt === "string" ? d.failureAt : undefined,
  };
}

export function isThirdPartyExportFailureNotification(
  item: Pick<NotificationItem, "kind">,
) {
  return item.kind === "THIRD_PARTY_EXPORT_FAILED";
}

type NotificationTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

function valueToString(value: unknown) {
  if (value == null) return "0";
  return String(value);
}

/**
 * 对已知 kind 在客户端用 next-intl 渲染标题与正文；其余 kind 仍使用服务端落库的文案。
 * （导入类通知历史上写死英文，这里按 kind + data 覆盖显示以适配界面语言。）
 */
export function resolveNotificationDisplay(
  item: NotificationItem,
  t: NotificationTranslator,
): NotificationDisplay {
  const kind = item.kind;

  if (
    kind === "IMPORT_BATCH_COMPLETED" ||
    kind === "IMPORT_BATCH_PARTIAL_FAILED"
  ) {
    const d = (item.data ?? {}) as ImportBatchData;
    const total = valueToString(d.totalCount);
    const success = valueToString(d.successCount);
    const failed = valueToString(d.failedCount);
    const skipped = valueToString(d.skippedCount);
    const isWarning = kind === "IMPORT_BATCH_PARTIAL_FAILED";
    return {
      title: t(`kinds.${kind}.title`),
      bodyMarkdown: t(`kinds.${kind}.body`, {
        total,
        success,
        failed,
        skipped,
      }),
      eyebrow: t(
        isWarning ? "templates.importWarning" : "templates.importSuccess",
      ),
      tone: isWarning ? "warning" : "success",
      summary: [
        { label: t("summary.success"), value: success, tone: "success" },
        { label: t("summary.failed"), value: failed, tone: "warning" },
        { label: t("summary.skipped"), value: skipped, tone: "neutral" },
      ],
    };
  }

  if (kind === "REVIEW_DIGEST") {
    const d = (item.data ?? {}) as ReviewDigestData;
    const type =
      d.type === "WEEKLY" || d.type === "MONTHLY" || d.type === "PLAN"
        ? d.type
        : "DAILY";
    return {
      // Review notifications can outlive the locale that was stored when the
      // worker created them. Render known titles in the current UI locale so
      // old notifications and locale changes do not produce mixed languages.
      title: t(`reviewReadyTitles.${type}`),
      bodyMarkdown: item.bodyMarkdown,
      eyebrow: t("templates.reviewDigest"),
      tone: "insight",
      summary: [
        {
          label: t("summary.reviewType"),
          value: t(`reviewTypes.${type}`),
          tone: "insight",
        },
      ],
      actionLabel: t("openReview"),
    };
  }

  if (kind === "THIRD_PARTY_EXPORT_FAILED") {
    const d = parseThirdPartyExportFailedData(item.data);
    const sourceLabel = d.sourceLabel || "TrainingLoad";
    const activityName = d.activityName || d.hashId || "";
    const provider = d.provider || "external provider";
    return {
      title: t("kinds.THIRD_PARTY_EXPORT_FAILED.title"),
      bodyMarkdown: t("kinds.THIRD_PARTY_EXPORT_FAILED.body", {
        sourceLabel,
        activityName,
        provider,
      }),
      preview: t("kinds.THIRD_PARTY_EXPORT_FAILED.preview", {
        sourceLabel,
        activityName,
        provider,
      }),
      eyebrow: t("templates.exportFailed"),
      tone: "warning",
      summary: [
        {
          label: t("summary.exportRoute"),
          value: `${sourceLabel} → ${provider}`,
          tone: "warning",
        },
      ],
    };
  }

  return {
    title: item.title,
    bodyMarkdown: item.bodyMarkdown,
    eyebrow: t("templates.general"),
    tone: "neutral",
    summary: [],
  };
}

export function getNotificationPreview(markdown?: string | null) {
  if (!markdown) return "";
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s>*-]+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s*\n+\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}
