import { Inject, Injectable, ForbiddenException } from '@nestjs/common';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import type { PlanDb } from '../persistence/plan-db';

/** Existing plan-advice entitlement and AI data consent apply to automated planning too. */
@Injectable()
export class RollingPlanAuthorizationService {
  constructor(
    @Inject(FEATURE_ACCESS_POLICY) private readonly access: FeatureAccessPolicy,
    private readonly consent: AiDataConsentService,
  ) {}
  async assertAllowed(userId: string, tx: PlanDb) {
    const snapshot = await this.access.evaluate(userId, ['ai.planAdvice']);
    if (
      !snapshot.features['ai.planAdvice']?.allowed ||
      !(await this.consent.isGranted(userId, tx))
    )
      throw new ForbiddenException({
        code: 'ROLLING_AI_ACCESS_REQUIRED',
        message: 'Current plan advice access and AI data consent are required',
      });
  }
}
