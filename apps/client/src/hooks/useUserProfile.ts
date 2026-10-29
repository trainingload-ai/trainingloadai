"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUserProfile,
  updateUserProfile,
  UserProfile,
  getUserCriticalPowerHistory,
  getUserBodyMetrics,
  replaceUserBodyMetrics,
  BodyMetricType,
} from "@/api/settings";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SportType } from "@/api/activities";
import { queryKeys, USER_ZONES_QUERY_KEY } from "@/lib/query-keys";
import { ensureUserTimezoneInitialized } from "@/lib/initialize-user-timezone";

/**
 * Custom Hook to get user profile information
 * Provides caching and error handling capabilities
 */
export function useUserProfile(sport?: SportType, enabled = true) {
  return useQuery({
    queryKey: queryKeys.user.profile(sport),
    queryFn: async () => {
      const response = await getUserProfile(sport);
      if (!response || response.timezone) return response;
      const initialized = await ensureUserTimezoneInitialized();
      return initialized?.timezone
        ? { ...response, timezone: initialized.timezone }
        : response;
    },
    refetchOnWindowFocus: false,
    retry: 2,
    enabled,
  });
}

/**
 * Custom Hook to get user critical power history
 */
export function useUserCriticalPowerHistory(
  sport?: SportType,
  metric: "cp" | "ftp" = "cp",
) {
  return useQuery({
    queryKey: queryKeys.user.criticalPowerHistory(sport, metric),
    queryFn: async () => {
      return await getUserCriticalPowerHistory(sport, metric);
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * Custom Hook to update user profile
 */
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  const t = useTranslations("UserProfile");

  return useMutation({
    mutationFn: async (profile: Partial<UserProfile>) => {
      return await updateUserProfile(profile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
      queryClient.invalidateQueries({ queryKey: USER_ZONES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.pace.zonesRoot() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.heartRate.zonesRoot(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.power.zonesRoot() });
      toast.success(t("updateSuccess"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("updateError"));
    },
  });
}

export function useUserBodyMetrics(type: BodyMetricType, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.user.bodyMetrics(type),
    queryFn: async () => {
      return await getUserBodyMetrics(type);
    },
    enabled,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

export function useReplaceUserBodyMetrics() {
  const queryClient = useQueryClient();
  const t = useTranslations("UserProfile");

  return useMutation({
    mutationFn: async (payload: {
      type: BodyMetricType;
      metrics: Array<{ effectiveDate: string; value: string }>;
    }) => {
      return await replaceUserBodyMetrics(payload.type, payload.metrics);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile() });
      toast.success(t("updateSuccess"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("updateError"));
    },
  });
}

/**
 * Hook to get user's max heart rate
 * Prioritizes returning user-configured max heart rate, otherwise returns null
 */
export function useUserMaxHeartRate() {
  const { data: profile, isLoading, error } = useUserProfile();

  return {
    maxHeartRate: profile?.maxHeartRate || null,
    isLoading,
    error,
    hasUserMaxHeartRate: !!profile?.maxHeartRate,
  };
}

/**
 * Hook to get user's resting heart rate
 */
export function useUserRestingHeartRate() {
  const { data: profile, isLoading, error } = useUserProfile();

  return {
    restingHeartRate: profile?.restingHeartRate || null,
    isLoading,
    error,
    hasUserRestingHeartRate: !!profile?.restingHeartRate,
  };
}
/**
 * Unified Hook to get user basic information
 * Contains all user information required for heart rate analysis
 */
export function useUserBasicInfo(sport?: SportType) {
  const { data: profile, isLoading, error } = useUserProfile(sport);

  return {
    maxHeartRate: profile?.maxHeartRate || null,
    restingHeartRate: profile?.restingHeartRate || null,
    lthr: profile?.lthr || null,
    age: profile?.age || null,
    gender: profile?.gender as "male" | "female" | null,
    weight: profile?.weight || null,
    height: profile?.height || null,
    ftp: profile?.ftp || null,
    cp: profile?.cp || null,
    wPrime: profile?.wPrime || null,
    isLoading,
    error,
    hasMaxHeartRate: !!profile?.maxHeartRate,
    hasRestingHeartRate: !!profile?.restingHeartRate,
    hasLthr: !!profile?.lthr,
    hasAge: !!profile?.age,
    hasGender: !!profile?.gender,
  };
}
