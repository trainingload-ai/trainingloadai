import type { ComponentType } from "react";

import type { DemoChartPoint } from "@/components/charts/demo-chart-data";

export type DashboardDemoStatKey = "vo2Max" | "atl" | "ctl" | "tsb";

export type DashboardDemoStat = {
  key: DashboardDemoStatKey;
  title: string;
  value: string;
  unit?: string;
  detail: string;
  details: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
};

export type DashboardDemoChart = {
  id: string;
  title: string;
  data: DemoChartPoint[];
  accentColor: string;
  icon: ComponentType<{ className?: string }>;
};

export type DashboardDemoPayload = {
  sportFilter: string;
  editLabel: string;
  stats: DashboardDemoStat[];
  charts: DashboardDemoChart[];
};

export type DashboardDemoCopy = {
  aboutMetric: string;
  overview: {
    title: string;
    recent30Days: string;
  };
  payload: DashboardDemoPayload;
};
