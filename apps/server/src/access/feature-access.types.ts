export const PRODUCT_FEATURES = [
  'ai.coach',
  'ai.activityReview',
  'ai.periodReview',
  'ai.todaySuggestion',
  'ai.planAdvice',
] as const;

export type ProductFeature = (typeof PRODUCT_FEATURES)[number];

export type FeatureAccessReason =
  | 'GRANTED'
  | 'PLAN_REQUIRED'
  | 'FEATURE_DISABLED';

export type FeatureAccessDecision = {
  allowed: boolean;
  reason: FeatureAccessReason;
};

export type FeatureAccessSnapshot = {
  schemaVersion: 1;
  features: Record<ProductFeature, FeatureAccessDecision>;
};

export function featureAccessSnapshot(
  decision: FeatureAccessDecision,
): FeatureAccessSnapshot {
  return {
    schemaVersion: 1,
    features: Object.fromEntries(
      PRODUCT_FEATURES.map((feature) => [feature, { ...decision }]),
    ) as FeatureAccessSnapshot['features'],
  };
}

export function featureAllowed(
  snapshot: FeatureAccessSnapshot,
  feature: ProductFeature,
): boolean {
  return snapshot.features[feature]?.allowed === true;
}
