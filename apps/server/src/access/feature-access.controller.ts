import { Controller, Get, Inject } from '@nestjs/common';

import { RawResponse } from '@/response-envelope';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
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
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  getFeatures(@CurrentUserId() userId: string) {
    return this.access.evaluate(userId);
  }
}
