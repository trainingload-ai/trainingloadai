"use client";

import { HeartRateDemoApp } from "./heart-rate/heart-rate-demo-app";
import { PaceDemoApp } from "./pace/pace-demo-app";
import { PmcDemoApp } from "./pmc/pmc-demo-app";
import { PowerDemoApp } from "./power/power-demo-app";
import type { MetricDemoView } from "./types";

export function MetricDemoApp({ view }: { view: MetricDemoView }) {
  switch (view) {
    case "pmc":
      return <PmcDemoApp />;
    case "power":
      return <PowerDemoApp />;
    case "pace":
      return <PaceDemoApp />;
    case "heart-rate":
      return <HeartRateDemoApp />;
    default:
      return <PmcDemoApp />;
  }
}
