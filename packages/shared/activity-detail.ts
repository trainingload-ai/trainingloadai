/**
 * Cross-client activity detail state.
 *
 * An activity can already contain useful summary data before the analysis
 * pipeline reaches READY. Web and mobile use this model to keep the generic
 * detail view available while enhanced charts are still processing.
 */
export type ActivityDetailStateInput = {
  processingStatus?: string | null;
  readyAt?: string | Date | null;
  status?: string | null;
};

export type ActivityDetailState = {
  canShowEnhancedDetail: boolean;
  failed: boolean;
  processing: boolean;
  status: string;
};

const FAILED_ACTIVITY_STATUSES = new Set(["FAILED", "PARTIAL_FAILED"]);

function normalizeActivityStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function getActivityDetailState(
  activity: ActivityDetailStateInput,
): ActivityDetailState {
  const processingStatus = normalizeActivityStatus(activity.processingStatus);
  const legacyStatus = normalizeActivityStatus(activity.status);
  const status = processingStatus || legacyStatus || "PROCESSING";
  const canShowEnhancedDetail =
    Boolean(activity.readyAt) ||
    processingStatus === "READY" ||
    (!processingStatus && legacyStatus === "READY");
  const failed = FAILED_ACTIVITY_STATUSES.has(status);

  return {
    canShowEnhancedDetail,
    failed,
    processing: !canShowEnhancedDetail,
    status,
  };
}

/**
 * Cross-client chart capability policy for activity detail.
 *
 * Overview charts are configurable on desktop. Specialist charts are rendered
 * by the desktop heart-rate, power, pace, and running-dynamics sections and can
 * be arranged in the native app's single chart stream. A metric must not be
 * added here merely because the ingestion pipeline can store it: it must have
 * an active activity-detail presentation on desktop as well.
 */
export type ActivityDetailChartId =
  | "elevation"
  | "pace"
  | "cadence"
  | "stride"
  | "heartRate"
  | "power"
  | "stanceTime"
  | "heartRateZones"
  | "powerZones"
  | "paceZones"
  | "verticalOscillation"
  | "verticalRatio"
  | "flightTime";

export type ActivityDetailChartSportGroup =
  | "RUN"
  | "CYCLING"
  | "SWIM"
  | "OTHER";

const ACTIVITY_DETAIL_OVERVIEW_CHART_IDS: Record<
  ActivityDetailChartSportGroup,
  readonly ActivityDetailChartId[]
> = {
  RUN: [
    "elevation",
    "pace",
    "cadence",
    "stride",
    "heartRate",
    "power",
    "stanceTime",
  ],
  CYCLING: ["elevation", "cadence", "heartRate", "power"],
  SWIM: ["heartRate"],
  OTHER: ["heartRate"],
};

const ACTIVITY_DETAIL_SPECIALIST_CHART_IDS: Record<
  ActivityDetailChartSportGroup,
  readonly ActivityDetailChartId[]
> = {
  RUN: [
    "paceZones",
    "heartRateZones",
    "powerZones",
    "verticalOscillation",
    "verticalRatio",
    "flightTime",
  ],
  CYCLING: ["heartRateZones", "powerZones"],
  SWIM: ["heartRateZones"],
  OTHER: ["heartRateZones"],
};

export function getActivityDetailChartSportGroup(
  sportType: string | null | undefined,
): ActivityDetailChartSportGroup {
  const normalized = String(sportType ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "RUN") return "RUN";
  if (normalized === "CYCLING") return "CYCLING";
  if (normalized === "SWIM") return "SWIM";
  return "OTHER";
}

export function getActivityDetailOverviewChartIds(
  sportType: string | null | undefined,
): readonly ActivityDetailChartId[] {
  return ACTIVITY_DETAIL_OVERVIEW_CHART_IDS[
    getActivityDetailChartSportGroup(sportType)
  ];
}

export function getActivityDetailConfigurableChartIds(
  sportType: string | null | undefined,
): readonly ActivityDetailChartId[] {
  const group = getActivityDetailChartSportGroup(sportType);
  return [
    ...ACTIVITY_DETAIL_OVERVIEW_CHART_IDS[group],
    ...ACTIVITY_DETAIL_SPECIALIST_CHART_IDS[group],
  ];
}
