export const ATHLETE_STATE_POLICY_VERSION = 'athlete-state-policy-v1';
export const ATHLETE_STATE_PROMPT_VERSION = 'athlete-state-assessment-v1';

export const ATHLETE_STATE_POLICY = Object.freeze({
  physiologyDays: 42,
  recentPhysiologyDays: 3,
  minimumBaselineSamples: 14,
  recentLoadDays: 7,
  comparisonLoadDays: 28,
  recoverySpacingDays: 14,
  performanceDays: 42,
  comparablePerformanceLimit: 6,
  subjectiveDays: 14,
  safetySubjectiveDays: 7,
  assessmentMaxAgeHours: 24,
  caseMaxAgeHours: 48,
  questionBudget: 2,
  repeatCooldownHours: 72,
});

export const ACTIVE_COACH_ASSESSMENT_CASE_STATUSES = [
  'OPEN',
  'ASSESSING',
  'WAITING_FOR_DATA',
  'WAITING_FOR_USER',
  'DECISION_READY',
] as const;
