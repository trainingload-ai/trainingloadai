"use client";

import { useEffect, useState } from "react";

import { useHomeDemoLightboxBack } from "../../HomeDemoLightbox";
import { metricDemoCopy } from "../../metric-demo/copy";
import { resolveDemoCopy } from "@/lib/demo-i18n";
import type { MetricDemoView } from "../../metric-demo/types";

export type DemoSubView = "main" | "day" | MetricDemoView;

export function useDemoSubView({
  lang,
  interactive,
}: {
  lang: string;
  interactive: boolean;
}) {
  const [view, setView] = useState<DemoSubView>("main");
  const setLightboxBack = useHomeDemoLightboxBack();
  const metricCopy = resolveDemoCopy(metricDemoCopy, lang);

  useEffect(() => {
    if (!interactive || view === "main" || !setLightboxBack) {
      return;
    }

    setLightboxBack({
      ariaLabel: metricCopy.back,
      onClick: () => setView("main"),
    });

    return () => setLightboxBack(null);
  }, [interactive, view, metricCopy.back, setLightboxBack]);

  return {
    view,
    setView,
    openDay: () => setView("day"),
    openMetric: (metricView: MetricDemoView) => setView(metricView),
    goMain: () => setView("main"),
  };
}
