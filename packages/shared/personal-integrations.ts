/** Personal integrations are installed only by the single-owner composition. */
export type PersonalProvider = "garmin" | "coros";
export type PersonalRegion = "global" | "cn" | "eu" | "us";
export type PersonalSettings = {
  automatic: boolean;
  activities: boolean;
  wellness: boolean;
  allowWrites: boolean;
  timezone: string;
};
export type PersonalJobStatus =
  | "PREVIEW"
  | "QUEUED"
  | "RUNNING"
  | "WAITING"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN"
  | "CANCELLED";
export type PersonalSyncTrigger =
  | "first_connect"
  | "focus"
  | "dawn"
  | "manual";
export type PersonalJob = {
  id: string;
  kind: string;
  status: PersonalJobStatus;
  errorCode?: string | null;
  result?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  reconciling?: boolean;
  /** SYNC window from job payload; absent on WRITE jobs. */
  startDate?: string | null;
  endDate?: string | null;
  /** SYNC enqueue source: first_connect | focus | dawn | manual. */
  trigger?: PersonalSyncTrigger | string | null;
};
export type PersonalConnectionStatus = {
  provider: PersonalProvider;
  connected: boolean;
  state: string;
  region?: PersonalRegion;
  accountId?: string | null;
  credentialLast4?: string | null;
  settings: PersonalSettings;
  lastSyncCompletedAt?: string | null;
  errorCode?: string | null;
  jobs: PersonalJob[];
  tools?: string[];
};
