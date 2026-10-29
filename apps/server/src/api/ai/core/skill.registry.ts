import { fitnessAssessmentSkill } from './skills/fitnessAssessment.skill';
import type { ActiveCoachSkill, CoachSkillDef } from './skill.types';
import { metricExplainerSkill } from './skills/metricExplainer.skill';
import { planCycleReviewSkill } from './skills/planCycleReview.skill';
import { planDayReviewSkill } from './skills/planDayReview.skill';
import { planFollowupSkill } from './skills/planFollowup.skill';
import { planBuilderSkill } from './skills/planBuilder.skill';
import { planWeekReviewSkill } from './skills/planWeekReview.skill';
import { performanceReviewSkill } from './skills/performanceReview.skill';
import { readinessCheckSkill } from './skills/readinessCheck.skill';
import { weekReviewSkill } from './skills/weekReview.skill';
import { integrationSupportSkill } from './skills/integrationSupport.skill';
import { workoutManagementSkill } from './skills/workoutManagement.skill';
import { workoutGeneratorSkill } from './skills/workoutGenerator.skill';
import { trainingAnalyticsSkill } from './skills/trainingAnalytics.skill';
import { periodReviewSkill } from './skills/periodReview.skill';
import { activityReviewSkill } from './skills/activityReview.skill';
import { planReviewAdjustmentSkill } from './skills/planReviewAdjustment.skill';

export function getCoachSkills(): CoachSkillDef[] {
  return [
    integrationSupportSkill,
    activityReviewSkill,
    planReviewAdjustmentSkill,
    periodReviewSkill,
    fitnessAssessmentSkill,
    trainingAnalyticsSkill,
    workoutGeneratorSkill,
    workoutManagementSkill,
    planFollowupSkill,
    planDayReviewSkill,
    planWeekReviewSkill,
    planCycleReviewSkill,
    planBuilderSkill,
    readinessCheckSkill,
    weekReviewSkill,
    performanceReviewSkill,
    metricExplainerSkill,
  ];
}

function toActiveSkill(
  skill: CoachSkillDef,
  activatedBy: string,
): ActiveCoachSkill {
  return {
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    suggestedTools: skill.suggestedTools ?? [],
    prompt: skill.prompt,
    activatedBy,
  };
}

export function getCoachSkillByName(name: string): ActiveCoachSkill | null {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  const skill = getCoachSkills().find((item) => {
    if (item.name.toLowerCase() === normalized) return true;
    return Boolean(
      item.aliases?.some((alias) => alias.toLowerCase() === normalized),
    );
  });
  if (!skill) return null;
  return toActiveSkill(skill, `explicit:${normalized}`);
}

export function listCoachSkillsForPrompt(): Array<{
  name: string;
  description: string;
  whenToUse: string;
}> {
  return getCoachSkills()
    .filter((skill) => skill.catalogVisible !== false)
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
    }));
}
