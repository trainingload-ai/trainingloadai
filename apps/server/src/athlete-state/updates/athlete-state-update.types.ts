/** Reasons to skip an assessment, separate from database setting categories. */
export enum AthleteStateUpdateSkipReason {
  /** Automatic updates are disabled; explicit user answers may bypass this preference. */
  AUTOMATION_DISABLED = 'AUTOMATION_DISABLED',
  /** A maintenance or historical replay scope suppresses automatic assessments. */
  MAINTENANCE = 'MAINTENANCE',
  /** No AI provider is currently configured. */
  AI_PROVIDER_UNAVAILABLE = 'AI_PROVIDER_UNAVAILABLE',
  /** A valid data-processing grant must be obtained before assessment. */
  AI_DATA_CONSENT_REQUIRED = 'AI_DATA_CONSENT_REQUIRED',
  /** The user lacks ai.coach feature access; this does not check their credit balance. */
  FEATURE_ACCESS_REQUIRED = 'FEATURE_ACCESS_REQUIRED',
  /** The changed health date falls outside the current assessment evidence window. */
  OUTSIDE_EVIDENCE_WINDOW = 'OUTSIDE_EVIDENCE_WINDOW',
  /** No request in the coalesced task remains eligible for execution. */
  NO_ELIGIBLE_REQUESTS = 'NO_ELIGIBLE_REQUESTS',
}
