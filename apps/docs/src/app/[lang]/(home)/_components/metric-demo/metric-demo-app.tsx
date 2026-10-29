"use client";

import { resolveDemoCopy } from "@/lib/demo-i18n";

import { metricDemoCopy } from "./copy";
import { HeartRateDemoApp } from "./heart-rate/heart-rate-demo-app";
import { PaceDemoApp } from "./pace/pace-demo-app";
import { PmcDemoApp } from "./pmc/pmc-demo-app";
import { PowerDemoApp } from "./power/power-demo-app";
import type { MetricDemoView } from "./types";

export function MetricDemoApp({
  lang,
  view,
}: {
  lang: string;
  view: MetricDemoView;
}) {
  resolveDemoCopy(metricDemoCopy, lang);

  switch (view) {
    case "pmc":
      return <PmcDemoApp lang={lang} />;
    case "power":
      return <PowerDemoApp lang={lang} />;
    case "pace":
      return <PaceDemoApp lang={lang} />;
    case "heart-rate":
      return <HeartRateDemoApp lang={lang} />;
    default:
      return <PmcDemoApp lang={lang} />;
  }
}
