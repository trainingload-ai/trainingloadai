import type { AiToolContext } from '../tool.types';

export function planPhaseProgress(ctx: AiToolContext) {
  const assessment = ctx.planSuitability?.latest;
  if (
    ctx.activeSkillName !== 'plan-builder' ||
    ctx.planQuestionReview ||
    ctx.backgroundTask ||
    ctx.rollingPlanDraft ||
    assessment?.status !== 'READY' ||
    assessment.skillName !== 'plan-builder' ||
    assessment.constraints.periodWeeks < 12 ||
    !assessment.phases?.length ||
    !assessment.weekTargets?.length
  ) return undefined;

  const { assessmentId, phases, weekTargets } = assessment;
  const { periodWeeks } = assessment.constraints;
  const staged = ctx.planSuitability?.stagedPhases;
  const accepted = staged?.assessmentId === assessmentId ? staged : undefined;
  const completedThroughWeek = accepted?.completedThroughWeek ?? 0;
  const completedWindows = accepted?.completedWindows ?? 0;
  const startWeek = completedThroughWeek + 1;
  const phase = phases.find(({ endWeek }) => endWeek >= startWeek);
  const endWeek = phase ? Math.min(phase.endWeek, startWeek + 3) : completedThroughWeek;
  const next = phase ? {
    startWeek,
    endWeek,
    name: phase.name,
    weekTargets: weekTargets.slice(startWeek - 1, endWeek),
  } : null;
  return { assessmentId, periodWeeks, completedThroughWeek, completedWindows, next };
}
