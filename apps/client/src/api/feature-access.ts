import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export type ProductFeature =
  | 'ai.coach'
  | 'ai.activityReview'
  | 'ai.periodReview'
  | 'ai.todaySuggestion'
  | 'ai.planAdvice';

export type FeatureAccessSnapshot = {
  schemaVersion: 1;
  features: Record<
    ProductFeature,
    {
      allowed: boolean;
      reason: 'GRANTED' | 'PLAN_REQUIRED' | 'FEATURE_DISABLED';
    }
  >;
};

export function useFeatureAccess(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.ai.featureAccess(),
    queryFn: ({ signal }) =>
      apiFetch<FeatureAccessSnapshot>('/api/access/features', {
        signal,
        responseFormat: 'raw-json',
      }),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function featureAllowed(
  snapshot: FeatureAccessSnapshot | undefined,
  feature: ProductFeature,
) {
  return snapshot?.features[feature]?.allowed === true;
}
