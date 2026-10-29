"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import { useSimpleApiQuery } from "@/hooks/useApiQuery";
import { apiFetch } from "@/lib/api";
import { MetricHistoryPanel } from "../components/FitnessStatus/MetricHistoryDialog";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

type MetricKey =
  | "atl"
  | "ctl"
  | "tsb"
  | "vo2Max"
  | "acRatio"
  | "monotony"
  | "intensity";

interface FitnessStatusData {
  vo2Max?: number;
  ctl: number;
  atl: number;
  tsb: number;
  acRatio: number;
  monotony: number;
  intensity: number;
  restDays: number;
}

const METRIC_KEYS: MetricKey[] = [
  "atl",
  "ctl",
  "tsb",
  "vo2Max",
  "acRatio",
  "monotony",
  "intensity",
];

export default function FitnessMetricPage() {
  const t = useTranslations("dashboard.fitnessStatus");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const metricKeyParam = searchParams.get("metricKey");
  const metricKey: MetricKey = METRIC_KEYS.includes(metricKeyParam as MetricKey)
    ? (metricKeyParam as MetricKey)
    : "vo2Max";

  const { data: fitnessData } = useSimpleApiQuery(["fitness-status"], () =>
    apiFetch<FitnessStatusData>("/pmc/status"),
  );

  const title = t(`${metricKey}.title`);
  const description = t(`${metricKey}.details`);
  const unit = metricKey === "vo2Max" ? "ml/kg/min" : "";
  const currentValueRaw = fitnessData?.[metricKey];
  const currentValue =
    currentValueRaw !== undefined && currentValueRaw !== null
      ? String(currentValueRaw)
      : "-";
  const docsLocale = locale.startsWith("zh") ? "zh" : "en";

  useSetPageTitle(title);

  return (
    <div className="w-full max-w-3xl mx-auto p-0">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size={"xs"}
          onClick={() => router.back()}
          aria-label={t("backButton")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-row items-center gap-2">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-lg font-semibold text-primary">
            {currentValue}
            <span className="text-mobile-caption pc:text-xs font-normal text-muted-foreground ml-1">
              {unit}
            </span>
          </div>
        </div>
      </div>

      <MetricHistoryPanel
        metricKey={metricKey}
        title={title}
        currentValue={currentValue}
        unit={unit}
        description={description}
        links={
          metricKey === "vo2Max"
            ? [
                {
                  label: t("aboutMetric", { title }),
                  href: `https://www.trainingload.ai/${docsLocale}/docs/metrics/maximal-oxygen-uptake`,
                },
              ]
            : [
                {
                  label: t("aboutMetric", { title }),
                  href: `https://www.trainingload.ai/${docsLocale}/docs/metrics`,
                },
              ]
        }
        showHeader={false}
        containerClassName="min-h-0"
      />
    </div>
  );
}
