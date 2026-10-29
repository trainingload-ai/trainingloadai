/** Public display keys, independent of providers and localized at render time.
 * Registry coverage tests require a deliberate label for every new capability.
 * Internal IDs remain in persisted events, never used as fallback UI copy.
 */
export const COACH_SKILL_LABELS = {
  "integration-support": "integrationSupport",
  "fitness-assessment": "fitnessAssessment",
  "training-analytics": "trainingAnalytics",
  "activity-review": "activityReview",
  "workout-management": "workoutManagement",
  "workout-generator": "workoutGenerator",
  "plan-followup": "planFollowup",
  "plan-day-review": "planDayReview",
  "plan-week-review": "planWeekReview",
  "plan-review-adjustment": "planReviewAdjustment",
  "plan-cycle-review": "planCycleReview",
  "period-review": "periodReview",
  "plan-builder": "planBuilder",
  "readiness-check": "readinessCheck",
  "week-review": "weekReview",
  "performance-review": "performanceReview",
  "metric-explainer": "metricExplainer",
} as const;

export const COACH_TOOL_LABELS = {
  "activity.byHashId": "activityDetail",
  "activity.series": "activitySeries",
  "activity.search": "activitySearch",
  "activity.day_view": "activityDay",
  "activity.recent": "activityRecent",
  ask_user_question: "question",
  "bests.summary": "bests",
  "compare.blocks": "compareBlocks",
  coach_decision_draft: "decisionDraft",
  coach_decision_apply: "decisionApply",
  "competition.events.list": "competitionList",
  "competition.impact.resolve": "competitionImpact",
  "time.current": "currentTime",
  "docs.search": "docsSearch",
  "docs.get": "docsRead",
  "integration.status": "integrationStatus",
  "training.data_coverage": "trainingDataCoverage",
  coach_task_submit_result: "coachTaskResult",
  "memory.search": "memorySearch",
  "web.search": "webSearch",
  "web.fetch": "webFetch",
  "metric.current": "metricCurrent",
  "metric.history": "metricHistory",
  "metric.compare": "metricCompare",
  "profile.current": "profile",
  "profile.zones": "thresholds",
  "profile.zone_ranges": "zones",
  "pmc.range": "loadTrend",
  "plan.by_id": "planRead",
  "plan.active": "planActive",
  "plan.recent": "planRecent",
  "plan.suitability_assess": "planSuitability",
  "plan.day_view": "planDay",
  "plan.execution_context": "planExecution",
  "plan.proposal_preview": "planPreview",
  "training.aggregate": "trainingAggregate",
  "training.baseline": "trainingBaseline",
  "training.plan_context": "trainingPlanContext",
  "training.readiness": "readiness",
  "training.weekSummary": "weekSummary",
  "workout.intensity_strategy": "intensity",
  present_coach_plan_draft: "planDraft",
  present_plan_workout_adjustment_draft: "workoutAdjustment",
  present_training_visualization: "visualization",
  "skill.activate": "skillActivate",
  "fitness.methods": "fitnessMethods",
  "fitness.evidence": "fitnessEvidence",
  "fitness.calculate": "fitnessCalculate",
  "fitness.track": "fitnessTrack",
  mutation_apply_fitness_calculation: "fitnessApply",
  mutation_activity_delete: "activityDelete",
  mutation_activity_description: "activityDescription",
  mutation_activity_session_rpe: "activityRpe",
  mutation_activity_plan_link: "activityLink",
  mutation_activity_plan_unlink: "activityUnlink",
  mutation_competition_event: "competitionUpdate",
  mutation_plan_lifecycle: "planLifecycle",
  mutation_plan_workout_add: "workoutAdd",
  mutation_plan_workout_update: "workoutUpdate",
  mutation_plan_workout_status: "workoutStatus",
  mutation_plan_workout_postpone: "workoutPostpone",
  mutation_user_fitness_metric: "metricUpdate",
  mutation_user_body_weight: "bodyWeightUpdate",
} as const;

function ownValue<T extends Record<string, string>>(
  catalog: T,
  name?: string,
): T[keyof T] | undefined {
  return name && Object.prototype.hasOwnProperty.call(catalog, name)
    ? catalog[name as keyof T]
    : undefined;
}

export const coachSkillLabelKey = (name?: string) =>
  ownValue(COACH_SKILL_LABELS, name);
const PROVIDER_TOOL_LABELS = Object.fromEntries(
  Object.entries(COACH_TOOL_LABELS).map(([name, key]) => [
    name.replace(/\./g, "_"),
    key,
  ]),
);
export const coachToolLabelKey = (name?: string) =>
  ownValue(COACH_TOOL_LABELS, name) ?? ownValue(PROVIDER_TOOL_LABELS, name);
