export type MetricDemoView = "pmc" | "power" | "pace" | "heart-rate";

export type SummaryMetricKey = "pmc" | "power" | "speed" | "hr";

export function summaryKeyToView(key: SummaryMetricKey): MetricDemoView {
  switch (key) {
    case "pmc":
      return "pmc";
    case "power":
      return "power";
    case "speed":
      return "pace";
    case "hr":
      return "heart-rate";
    default:
      return "pmc";
  }
}

export type DemoSportOption = { value: "all" | "RUN" | "CYCLING" | "SWIM"; label: string };
export type DemoTimeOption = { key: "thisYear" | "last30" | "last90"; label: string };

export type MetricDemoCopy = {
  back: string;
  sportOptions: DemoSportOption[];
  timeOptions: DemoTimeOption[];
  pmc: {
    calculate: string;
    calculating: string;
    combinedTitle: string;
    fitnessChart: string;
    fatigueChart: string;
    formChart: string;
    noData: string;
    abbr: { fitness: string; fatigue: string; form: string };
    fitness: { title: string };
    fatigue: { title: string };
    form: { title: string };
    load: { title: string };
    zoneHelp: {
      ariaLabel: string;
      title: string;
      danger: string;
      optimal: string;
      neutral: string;
      fresh: string;
      peak: string;
      transition: string;
    };
    acmpHelp: { title: string; formula: string; sweet: string; danger: string; advice: string };
  };
  power: {
    tabs: { curve: string; maximum: string; zones: string; profile: string };
    zonesTitle: string;
    maximumTitle: string;
    profileTitle: string;
    chartTitle: string;
    noData: string;
    ftp: string;
    cp: string;
    table: Record<string, string>;
    profile: {
      male: string;
      female: string;
      riderType: string;
      levels: string[];
      durations: Record<string, string>;
    };
    maximum: { bucketDay: string; bucketWeek: string; bucketMonth: string };
  };
  pace: {
    tabs: { curve: string; zones: string };
    chartTitle: string;
    zonesTitle: string;
    noData: string;
    cs: string;
    table: { segment: string; pace: string; time: string };
    distances: Record<string, string>;
  };
  heartRate: {
    tabs: { curve: string; zones: string };
    chartTitle: string;
    zonesTitle: string;
    noData: string;
    maxHr: string;
    lthr: string;
    table: Record<string, string>;
  };
};

export type MetricDemoCopyMap = Record<string, MetricDemoCopy>;
