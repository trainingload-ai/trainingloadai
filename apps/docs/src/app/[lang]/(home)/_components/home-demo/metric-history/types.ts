export type FitnessMetricKey =
  | "atl"
  | "ctl"
  | "tsb"
  | "vo2Max"
  | "intensity"
  | "restDays";

export type MetricHistoryLink = {
  label: string;
  href: string;
};

export type MetricHistoryDialogState = {
  open: boolean;
  key: FitnessMetricKey;
  title: string;
  currentValue: string;
  unit: string;
  description: string;
  links: MetricHistoryLink[];
};

export const createInitialMetricHistoryDialogState =
  (): MetricHistoryDialogState => ({
    open: false,
    key: "atl",
    title: "",
    currentValue: "",
    unit: "",
    description: "",
    links: [],
  });
