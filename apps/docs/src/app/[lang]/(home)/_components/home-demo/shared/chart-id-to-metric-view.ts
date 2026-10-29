import type { MetricDemoView } from "../../metric-demo/types";

export function chartIdToMetricView(chartId: string): MetricDemoView {
  switch (chartId) {
    case "weekPressure":
    case "ctl":
    case "atl":
    case "tsb":
      return "pmc";
    case "power":
    case "ftp":
      return "power";
    case "pace":
    case "speed":
      return "pace";
    case "hr":
    case "heartRate":
    case "vo2Max":
      return "heart-rate";
    default:
      return "pmc";
  }
}
