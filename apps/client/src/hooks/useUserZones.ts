import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllUserZones,
  updateUserZone,
  resetUserZone,
  ZoneSetting,
  type ZoneBenchmark,
} from "../api/settings";
import { queryKeys, USER_ZONES_QUERY_KEY } from "@/lib/query-keys";

export { USER_ZONES_QUERY_KEY };

export function useUserZones(enabled = true) {
  return useQuery({
    queryKey: USER_ZONES_QUERY_KEY,
    queryFn: () => getAllUserZones(),
    enabled,
  });
}

export function useUserZone(sportType: string, zoneType: string) {
  return useQuery({
    queryKey: USER_ZONES_QUERY_KEY,
    queryFn: () => getAllUserZones(),
    select: (data) =>
      data?.find((z) => z.sportType === sportType && z.zoneType === zoneType),
  });
}

export function useUpdateUserZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sportType,
      zoneType,
      benchmark,
      zones,
    }: {
      sportType: string;
      zoneType: string;
      benchmark: ZoneBenchmark;
      zones: ZoneSetting[];
    }) => updateUserZone(sportType, zoneType, benchmark, zones),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_ZONES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartRate.zonesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.power.zonesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.pace.zonesRoot() });
    },
  });
}

export function useResetUserZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sportType,
      zoneType,
    }: {
      sportType: string;
      zoneType: string;
    }) => resetUserZone(sportType, zoneType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_ZONES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartRate.zonesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.power.zonesRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.pace.zonesRoot() });
    },
  });
}
