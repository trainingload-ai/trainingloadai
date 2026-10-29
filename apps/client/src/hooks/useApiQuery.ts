"use client";

import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { buildFilterParams } from "@/lib/filterUtils";

type FilterType = "dashboard" | "activities" | "map";

interface UseApiQueryOptions<TData>
  extends Omit<UseQueryOptions<TData>, "queryKey" | "queryFn"> {
  filterType?: FilterType;
  additionalParams?: Record<string, unknown>;
}

export function useApiQuery<TData>(
  queryKey: string[],
  queryFn: (params: Record<string, unknown>) => Promise<TData>,
  options: UseApiQueryOptions<TData> = {}
) {
  const { filterType, additionalParams = {}, ...queryOptions } = options;
  const store = useStore();

  // Get corresponding filters based on filterType
  const getFilters = () => {
    switch (filterType) {
      case "dashboard":
        return store.dashboardFilters;
      case "activities":
        return store.activitiesFilters;
      case "map":
        return store.mapFilters;
      default:
        return null;
    }
  };

  const filters = getFilters();
  const filterParams = filters ? buildFilterParams(filters) : {};
  const params: Record<string, unknown> = {
    ...filterParams,
    ...additionalParams,
  };

  // If there are pagination parameters, add them to query parameters
  if (filterType === "activities") {
    params.page = store.activitiesPage;
    params.limit = 10;
  }

  return useQuery({
    queryKey: [...queryKey, params],
    queryFn: () => queryFn(params),
    ...queryOptions,
  });
}

// Specifically for API queries that do not require filtering conditions
export function useSimpleApiQuery<TData>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options: Omit<UseQueryOptions<TData>, "queryKey" | "queryFn"> = {}
) {
  return useQuery({
    queryKey,
    queryFn,
    ...options,
  });
}
