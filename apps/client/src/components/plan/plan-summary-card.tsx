"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Activity, CheckCircle2, Layers3 } from "lucide-react";
import type { PlanSummary } from "@/api/plans";
import { formatPlanLoadDisplay } from "@/components/plan/detail/plan-detail-utils";

/**
 * 计划维度的 estimated vs actual 复盘卡片
 * - 顶部三大块：完成率、负荷情况（actual/estimated）、顺延/跳过
 * - 课次状态另由共享 PlanCycleProgressChart 展示，不与负荷混用。
 */
export function PlanSummaryCard({
  summary,
  loading,
  className,
}: {
  summary: PlanSummary | undefined;
  loading?: boolean;
  className?: string;
}) {
  const t = useTranslations("PlanSummary");

  if (loading) {
    return (
      <section className={`rounded-surface bg-muted/70 p-3 ${className ?? ""}`}>
        <div className="h-4 w-24 rounded-xs bg-background/80" />
        <div className="mt-3 h-32 w-full rounded-xs bg-background/60" />
      </section>
    );
  }
  if (!summary) return null;

  const { totals } = summary;

  return (
    <section className={`rounded-surface ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Stat
          icon={CheckCircle2}
          label={t("completionRate")}
          value={`${totals.completionRate}%`}
          hint={t("completionHint", {
            done: totals.doneCount,
            total: totals.workoutCount,
          })}
        />
        <Stat
          icon={Activity}
          label={t("complianceRate")}
          value={
            totals.complianceRate == null ? "—" : `${totals.complianceRate}%`
          }
          hint={t("complianceHint", {
            actual: formatPlanLoadDisplay(totals.actualLoad),
            expected: formatPlanLoadDisplay(totals.estimatedLoad),
          })}
        />
        {/* 第三张卡只展示 MOVED / SKIPPED；未完成（PLANNED + IN_PROGRESS）在执行统计。 */}
        <Stat
          icon={Layers3}
          label={t("statusBreakdown")}
          value={`${totals.movedCount} / ${totals.skippedCount}`}
          hint={t("statusHint", {
            moved: totals.movedCount,
            skipped: totals.skippedCount,
          })}
        />
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-surface bg-muted/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-mobile-caption pc:text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint ? (
        <div className="mt-1 text-mobile-caption pc:text-[11px] text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
