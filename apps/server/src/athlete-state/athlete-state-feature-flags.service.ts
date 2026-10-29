import { Injectable } from '@nestjs/common';

function enabled(name: string) {
  const value = process.env[name] ?? process.env[name.toLowerCase()];
  if (value == null || value.trim() === '') return true;
  return value.trim().toLowerCase() === 'true';
}

@Injectable()
export class AthleteStateFeatureFlags {
  evidenceEnabled() {
    return enabled('ATHLETE_STATE_EVIDENCE_ENABLED');
  }

  assessmentShadowEnabled() {
    return enabled('ATHLETE_STATE_ASSESSMENT_SHADOW_ENABLED');
  }

  caseEnabled() {
    return enabled('COACH_ASSESSMENT_CASE_ENABLED');
  }

  homeInquiryEnabled() {
    return enabled('COACH_ASSESSMENT_HOME_INQUIRY_ENABLED');
  }

  planDecisionEnabled() {
    return enabled('COACH_ASSESSMENT_PLAN_DECISION_ENABLED');
  }

  followupEnabled() {
    return enabled('COACH_ASSESSMENT_FOLLOWUP_ENABLED');
  }
}
