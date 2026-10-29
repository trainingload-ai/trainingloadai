import type {
  FeatureAccessSnapshot,
  ProductFeature,
} from './feature-access.types';

export const FEATURE_ACCESS_POLICY = Symbol('FEATURE_ACCESS_POLICY');

/** Product access only. Runtime/provider availability is exposed separately. */
export interface FeatureAccessPolicy {
  evaluate(
    userId: string,
    features?: readonly ProductFeature[],
    now?: Date,
  ): Promise<FeatureAccessSnapshot>;
}
