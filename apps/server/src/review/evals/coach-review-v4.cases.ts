import type { CoachReviewAction } from '@/api/ai/daily-plan-review-judgment';
import type { CoachReviewScale } from '../coach-review-context.service';

export const COACH_REVIEW_EVAL_RUNS_PER_CASE = 3;

export type CoachReviewEvalDecision = 'KEEP' | CoachReviewAction;

export type CoachReviewEvalCase = {
  id: string;
  scale: CoachReviewScale;
  facts: string;
  allowedDecisions: CoachReviewEvalDecision[];
  requiredEvidence: string[];
};

/**
 * Stable expert-labeled behavior set. Each case is run three times by the live
 * evaluation job; model outputs are accepted when they fall inside the expert
 * action set, while parser/ID/DSL validity remains a hard gate.
 */
export const COACH_REVIEW_V4_EVAL_CASES: CoachReviewEvalCase[] = [
  c(
    'daily-late-extra-run',
    'daily',
    '21:35 unplanned run load 26.9; next-day run load 21.4; short overnight recovery.',
    ['POSTPONE', 'REDUCE_VOLUME', 'RECOVERY'],
    ['EXTRA_ACTIVITY', 'SHORT_RECOVERY'],
  ),
  c(
    'daily-light-walk',
    'daily',
    '20-minute easy walk; next day is an ordinary easy run; stable execution.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'daily-mild-negative-tsb',
    'daily',
    'TSB is mildly negative, seven-day execution is stable, and next workout is appropriate.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'daily-severe-load-spacing',
    'daily',
    'Large late ride after a full training day; next morning is a threshold run.',
    ['POSTPONE', 'REDUCE_INTENSITY', 'RECOVERY'],
    ['LOAD_PRESSURE', 'SHORT_RECOVERY'],
  ),
  c(
    'daily-extra-run-before-rest',
    'daily',
    'Substantial unplanned run completed, but tomorrow is already a rest day.',
    ['KEEP'],
    ['EXTRA_ACTIVITY'],
  ),
  c(
    'daily-missed-replaced',
    'daily',
    'Planned aerobic run was missed but a comparable linked aerobic run supplied the same stimulus.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'daily-missed-not-replaced',
    'daily',
    'Key workout was missed, no replacement exists, and postponing it does not collide.',
    ['POSTPONE', 'KEEP'],
    ['MISSED_WORKOUT'],
  ),
  c(
    'daily-missing-subjective',
    'daily',
    'No sleep, pain, soreness, or RPE data; objective load and spacing are ordinary.',
    ['KEEP'],
    ['INSUFFICIENT_DATA'],
  ),
  c(
    'daily-race-tomorrow',
    'daily',
    'Unplanned moderate work tonight; target race is tomorrow and planned shakeout is optional.',
    ['SKIP', 'RECOVERY'],
    ['COMPETITION_CONSTRAINT'],
  ),
  c(
    'daily-two-upcoming-hard',
    'daily',
    'Late hard extra workout; postponing tomorrow hard session would collide with another hard session.',
    ['SKIP', 'REDUCE_INTENSITY', 'RECOVERY'],
    ['SHORT_RECOVERY', 'SCHEDULE_COLLISION'],
  ),
  c(
    'weekly-complete-balanced',
    'weekly',
    'All key sessions completed, actual load matches plan, and next week opens easy.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'weekly-underload-key-missed',
    'weekly',
    'Several easy sessions completed but the only threshold session was missed; next week opens easy.',
    ['POSTPONE', 'KEEP'],
    ['MISSED_WORKOUT'],
  ),
  c(
    'weekly-overload-next-hard',
    'weekly',
    'Actual week load is materially above the prior week, ATL is rising above CTL, and Monday is hard.',
    ['POSTPONE', 'REDUCE_VOLUME', 'REDUCE_INTENSITY'],
    ['LOAD_PRESSURE'],
  ),
  c(
    'weekly-overload-next-easy',
    'weekly',
    'Actual week load is high, but the next scheduled workout is a short recovery session.',
    ['KEEP', 'REDUCE_VOLUME'],
    ['LOAD_PRESSURE'],
  ),
  c(
    'weekly-missed-replaced-cross-training',
    'weekly',
    'Planned easy run was missed and replaced by equivalent low-impact aerobic cycling.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'weekly-repeat-rejected-decision',
    'weekly',
    'The same postponement was rejected yesterday and no material facts have changed.',
    ['KEEP'],
    ['RECENT_DECISION'],
  ),
  c(
    'weekly-new-facts-after-rejection',
    'weekly',
    'A prior postponement was rejected, then a substantial late extra workout was recorded.',
    ['POSTPONE', 'REDUCE_VOLUME', 'RECOVERY'],
    ['EXTRA_ACTIVITY', 'SHORT_RECOVERY'],
  ),
  c(
    'weekly-competition-taper',
    'weekly',
    'Taper week is on target and race-specific intensity is intentionally retained at low volume.',
    ['KEEP'],
    ['COMPETITION_CONSTRAINT'],
  ),
  c(
    'weekly-consecutive-load-days',
    'weekly',
    'Four meaningful load days in a row with no recovery space; next session is another hard stimulus.',
    ['POSTPONE', 'RECOVERY'],
    ['SHORT_RECOVERY', 'LOAD_PRESSURE'],
  ),
  c(
    'weekly-low-data-coverage',
    'weekly',
    'Only two days have usable activity load and PMC history is unavailable.',
    ['KEEP'],
    ['INSUFFICIENT_DATA'],
  ),
  c(
    'monthly-steady-progression',
    'monthly',
    'Four-week progression is gradual, key sessions are consistent, and the next phase starts easy.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'monthly-accumulated-overreach',
    'monthly',
    'Three weeks exceeded planned load, ATL stays elevated, and the next phase opens with intensity.',
    ['POSTPONE', 'REDUCE_VOLUME', 'REDUCE_INTENSITY'],
    ['LOAD_PRESSURE'],
  ),
  c(
    'monthly-undertraining',
    'monthly',
    'Repeated missed key work caused underload; next phase begins with a manageable key workout.',
    ['KEEP', 'POSTPONE'],
    ['MISSED_WORKOUT'],
  ),
  c(
    'monthly-phase-transition-race',
    'monthly',
    'Base phase completed; race-specific phase starts with a key workout and recovery spacing is adequate.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'monthly-illness-unknown',
    'monthly',
    'Training gaps exist but there is no illness, pain, sleep, or recovery evidence explaining them.',
    ['KEEP'],
    ['INSUFFICIENT_DATA'],
  ),
  c(
    'monthly-extra-volume-not-intensity',
    'monthly',
    'Month accumulated excess easy volume; next workout is a high-value intensity session after adequate rest.',
    ['KEEP', 'REDUCE_VOLUME'],
    ['LOAD_PRESSURE'],
  ),
  c(
    'monthly-key-stimulus-replaced',
    'monthly',
    'Several plan rows were missed, but linked real activities supplied equivalent sport-specific stimuli.',
    ['KEEP'],
    ['PLAN_ON_TRACK'],
  ),
  c(
    'monthly-first-session-collision',
    'monthly',
    'Next phase first key workout follows a late extra session; moving it one day collides with another key workout.',
    ['SKIP', 'REDUCE_INTENSITY', 'RECOVERY'],
    ['SHORT_RECOVERY', 'SCHEDULE_COLLISION'],
  ),
  c(
    'monthly-pmc-single-point',
    'monthly',
    'Only one PMC point exists; plan completion and activity details otherwise look ordinary.',
    ['KEEP'],
    ['INSUFFICIENT_DATA'],
  ),
  c(
    'monthly-plan-ending',
    'monthly',
    'Plan ends after the next workout; postponing would move it outside the plan and the stimulus was already replaced.',
    ['SKIP', 'KEEP'],
    ['SCHEDULE_COLLISION'],
  ),
];

function c(
  id: string,
  scale: CoachReviewScale,
  facts: string,
  allowedDecisions: CoachReviewEvalDecision[],
  requiredEvidence: string[],
): CoachReviewEvalCase {
  return { id, scale, facts, allowedDecisions, requiredEvidence };
}
