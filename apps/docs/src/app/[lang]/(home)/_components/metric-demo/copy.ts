import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { MetricDemoCopy } from "./types";

const sports = ["all", "RUN", "CYCLING", "SWIM"] as const;
const timeRanges = ["thisYear", "last30", "last90"] as const;

export function useMetricDemoCopy(): MetricDemoCopy {
  const t = useTranslations("home.demo.metric");

  return useMemo(
    () => ({
      sportOptions: sports.map((value) => ({
        value,
        label: t(`sportLabels.${value}`),
      })),
      timeOptions: timeRanges.map((key) => ({
        key,
        label: t(`timeLabels.${key}`),
      })),
      pmc: {
        ...(t.raw("pmc") as MetricDemoCopy["pmc"]),
        calculate: t("pmc.calculate"),
        calculating: t("pmc.calculating"),
      },
      power: {
        ...(t.raw("power") as MetricDemoCopy["power"]),
        tabs: {
          curve: t("power.tabs.curve"),
          maximum: t("power.tabs.maximum"),
          zones: t("power.tabs.zones"),
          profile: t("power.tabs.profile"),
        },
      },
      pace: {
        ...(t.raw("pace") as MetricDemoCopy["pace"]),
        tabs: {
          curve: t("pace.tabs.curve"),
          zones: t("pace.tabs.zones"),
        },
      },
      heartRate: {
        ...(t.raw("heartRate") as MetricDemoCopy["heartRate"]),
        tabs: {
          curve: t("heartRate.tabs.curve"),
          zones: t("heartRate.tabs.zones"),
        },
      },
    }),
    [t],
  );
}
