import { Injectable } from '@nestjs/common';

import type { FeatureAccessPolicy } from '@/access/feature-access-policy.port';
import {
  featureAccessSnapshot,
  type ProductFeature,
} from '@/access/feature-access.types';

@Injectable()
export class SelfHostFeatureAccessPolicy implements FeatureAccessPolicy {
  async evaluate(
    _userId: string,
    _features?: readonly ProductFeature[],
  ) {
    return featureAccessSnapshot({ allowed: true, reason: 'GRANTED' });
  }
}
