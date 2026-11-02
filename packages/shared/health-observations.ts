/** Coded observations retain their source system; category labels are not clinical grades. */
export type HealthObservationRecord = {
  id: string;
  groupId: string;
  kind: "BLOOD_PRESSURE" | "BREATHING_VARIATION";
  scope: "MEASUREMENT" | "DAILY" | "INTERVAL";
  localDate: string;
  timezone: string | null;
  offsetSeconds: number | null;
  measuredAt: string | null;
  intervalStart: string | null;
  intervalEnd: string | null;
  systolicMmHg: number | null;
  diastolicMmHg: number | null;
  pulseBpm: number | null;
  measurementOrigin: "DEVICE" | "MANUAL" | "UNKNOWN" | null;
  categorySystem: string | null;
  categoryCode: string | null;
  provider: string;
  sourceName: string | null;
  selected: boolean;
  sourceUpdatedAt: string;
};
export type HealthReportedQuantity = {
  id: string;
  type: string;
  localDate: string;
  value: number;
  unit: string;
  provider: string;
  sourceName: string | null;
  basis: "UNSPECIFIED_REPORT";
};
export type HealthObservationOverview = {
  startDate: string;
  endDate: string;
  items: HealthObservationRecord[];
  truncated: boolean;
  reports?: HealthReportedQuantity[];
};
