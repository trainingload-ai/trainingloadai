import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ThirdPartyConnectionEnvelope } from "./third-party-connection";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import { PUBLIC_DEMO_CAPABILITIES } from "@shared/public-demo-policy";

export type IntervalsIcuConnectionStatus = ThirdPartyConnectionEnvelope & {
  id?: string;
  provider?: string;
  status?: string;
  authType?: "api_key" | "oauth";
  externalAthleteId?: string | null;
  credentialLast4?: string | null;
  grantedScopes?: string[];
  oauthAthleteName?: string | null;
  syncActivities?: boolean;
  syncScheduledActivities?: boolean;
  syncPlannedWorkouts?: boolean;
  syncWellness?: boolean;
  exportActivities?: boolean;
  exportPlannedWorkouts?: boolean;
  exportWellness?: boolean;
  syncSportSettings?: boolean;
  exportSportSettings?: boolean;
  keyChangeConfirmationRequired?: boolean;
  pendingCredentialLast4?: string | null;
  lastSyncStartedAt?: string | null;
  lastSyncCompletedAt?: string | null;
  lastSyncedActivityAt?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  initialSync?:
    | (SyncIntervalsIcuResult & {
        started?: boolean;
        error?: string;
      })
    | null;
  plannedWorkoutSync?: PlannedWorkoutSyncStatus | null;
};

export type ConnectIntervalsIcuInput = {
  apiKey?: string;
  syncActivities?: boolean;
  syncScheduledActivities?: boolean;
  syncPlannedWorkouts?: boolean;
  syncWellness?: boolean;
  exportActivities?: boolean;
  exportPlannedWorkouts?: boolean;
  exportWellness?: boolean;
  syncSportSettings?: boolean;
  exportSportSettings?: boolean;
  replaceCredentialConfirmed?: boolean;
  plannedWorkoutWeekStart?: string;
};

export type StartIntervalsIcuOAuthInput = Omit<
  ConnectIntervalsIcuInput,
  "apiKey" | "replaceCredentialConfirmed"
> & {
  returnUrl?: string;
};

export type UpdateIntervalsIcuSettingsInput = Omit<
  ConnectIntervalsIcuInput,
  | "apiKey"
  | "replaceCredentialConfirmed"
  | "syncActivities"
  | "plannedWorkoutWeekStart"
>;

export type StartIntervalsIcuOAuthResult = {
  authorizationUrl: string;
  scopes: string[];
};

export type PlannedWorkoutSyncStatus = {
  lastStartedAt?: string | null;
  lastCompletedAt?: string | null;
  lastWindow?: {
    oldest: string;
    newest: string;
  } | null;
  lastResult?: PlannedWorkoutSyncResult | null;
  lastError?: string | null;
};

export type PlannedWorkoutSyncResult = {
  enabled?: boolean;
  window?: {
    oldest: string;
    newest: string;
  };
  import?: Record<string, unknown> | null;
  export?: Record<string, unknown> | null;
  error?: string;
};

export type SyncIntervalsIcuInput = {
  newest?: string;
  plannedWorkoutWeekStart?: string;
};

export type SyncIntervalsIcuResult = {
  window?: {
    oldest: string;
    newest: string;
  };
  totalFetched?: number;
  totalDiscovered?: number;
  queuedCount?: number;
  skippedCount?: number;
  batch?: {
    id: string;
  } | null;
  plannedWorkouts?: PlannedWorkoutSyncResult | null;
};

export const useIntervalsIcuStatus = (enabled = true) => {
  const publicDemo = usePublicDemo();
  return useQuery<IntervalsIcuConnectionStatus>({
    queryKey: queryKeys.account.intervalsIcu(),
    queryFn: async () => {
      const data = await apiFetch<IntervalsIcuConnectionStatus>(
        "/intervals-icu/status",
      );
      return data ?? { connected: false };
    },
    enabled:
      enabled &&
      (!publicDemo.active ||
        publicDemo.can(PUBLIC_DEMO_CAPABILITIES.INTEGRATIONS_READ)),
  });
};

export const useConnectIntervalsIcu = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["connect-intervals-icu"],
    mutationFn: async (input: ConnectIntervalsIcuInput) => {
      const data = await apiFetch<IntervalsIcuConnectionStatus>(
        "/intervals-icu/connect",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      if (!data) throw new Error("Failed to connect Intervals.icu");
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.account.intervalsIcu(), data);
    },
  });
};

/**
 * 开始 Intervals.icu OAuth 授权，返回授权 URL 和 scopes。
 * @returns
 */
export const useStartIntervalsIcuOAuth = () => {
  return useMutation({
    mutationKey: ["start-intervals-icu-oauth"],
    mutationFn: async (input: StartIntervalsIcuOAuthInput) => {
      const data = await apiFetch<StartIntervalsIcuOAuthResult>(
        "/intervals-icu/oauth/start",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
      if (!data?.authorizationUrl) {
        throw new Error("Failed to start Intervals.icu OAuth");
      }
      return data;
    },
  });
};

export const useUpdateIntervalsIcuSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["update-intervals-icu-settings"],
    mutationFn: async (input: UpdateIntervalsIcuSettingsInput) => {
      const data = await apiFetch<IntervalsIcuConnectionStatus>(
        "/intervals-icu/settings",
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      );
      if (!data) throw new Error("Failed to update Intervals.icu settings");
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.account.intervalsIcu(), data);
    },
  });
};

export const useDisconnectIntervalsIcu = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["disconnect-intervals-icu"],
    mutationFn: async () => {
      const data = await apiFetch<{ connected: boolean }>(
        "/intervals-icu/disconnect",
        {
          method: "DELETE",
        },
      );
      return data ?? { connected: false };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.account.intervalsIcu(), data);
    },
  });
};

export const useSyncIntervalsIcu = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["sync-intervals-icu"],
    mutationFn: async (input?: SyncIntervalsIcuInput) => {
      const data = await apiFetch<SyncIntervalsIcuResult>(
        "/intervals-icu/sync",
        {
          method: "POST",
          body: JSON.stringify(input ?? {}),
        },
      );
      if (!data) throw new Error("Failed to start Intervals.icu sync");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.account.intervalsIcu(),
      });
    },
  });
};
