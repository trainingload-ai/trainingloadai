import { Controller, Get, Inject } from '@nestjs/common';

import { RawResponse } from '@/response-envelope';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from './feature-access-policy.port';

@RawResponse()
@Controller('/api/access')
export class FeatureAccessController {
  constructor(
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly access: FeatureAccessPolicy,
  ) {}

  @Get('/features')
  getFeatures(@CurrentUserId() userId: string) {
    return this.access.evaluate(userId);
  }
}
