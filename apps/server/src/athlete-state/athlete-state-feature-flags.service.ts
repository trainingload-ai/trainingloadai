import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AthleteStateFeatureFlags {
  constructor(private readonly config: ConfigService) {}

  evidenceEnabled() {
    return this.config.get<boolean>('athleteState.evidenceEnabled', true);
  }

  assessmentShadowEnabled() {
    return this.config.get<boolean>(
      'athleteState.assessmentShadowEnabled',
      true,
    );
  }

  caseEnabled() {
    return this.config.get<boolean>('athleteState.caseEnabled', true);
  }

  homeInquiryEnabled() {
    return this.config.get<boolean>('athleteState.homeInquiryEnabled', true);
  }

  planDecisionEnabled() {
    return this.config.get<boolean>('athleteState.planDecisionEnabled', true);
  }

  followupEnabled() {
    return this.config.get<boolean>('athleteState.followupEnabled', true);
  }
}
