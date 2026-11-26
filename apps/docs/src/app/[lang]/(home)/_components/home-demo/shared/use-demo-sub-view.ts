"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useHomeDemoLightboxBack } from "../../HomeDemoLightbox";
import type { MetricDemoView } from "../../metric-demo/types";

export type DemoSubView = "main" | "day" | MetricDemoView;

export function useDemoSubView({
  interactive,
}: {
  interactive: boolean;
}) {
  const [view, setView] = useState<DemoSubView>("main");
  const setLightboxBack = useHomeDemoLightboxBack();
  const tCommon = useTranslations("commonLinks");
  const backLabel = tCommon("demoOverviewBack");

  useEffect(() => {
    if (!interactive || view === "main" || !setLightboxBack) {
      return;
    }

    setLightboxBack({
      ariaLabel: backLabel,
      onClick: () => setView("main"),
    });

    return () => setLightboxBack(null);
  }, [interactive, view, backLabel, setLightboxBack]);

  return {
    view,
    setView,
    openDay: () => setView("day"),
    openMetric: (metricView: MetricDemoView) => setView(metricView),
    goMain: () => setView("main"),
  };
}
