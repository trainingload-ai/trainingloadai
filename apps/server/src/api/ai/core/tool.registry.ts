import {
  fitnessMethodsTool,
  fitnessEvidenceTool,
  fitnessCalculateTool,
  fitnessApplyTool,
  fitnessTrackTool,
} from './tools/fitnessAssessment.tools';
import type { ActiveCoachSkill } from './skill.types';
import {
  isAiToolEnabled,
  toolMatchesName,
  type AiToolContext,
  type AiToolDef,
} from './tool.types';
import { activityByHashIdTool } from './tools/activityByHashId.tool';
import { activitySeriesTool } from './tools/activitySeries.tool';
import { pmcRangeTool } from './tools/pmcRange.tool';
import { zonesProfileTool } from './tools/zonesProfile.tool';
import { zoneRangesProfileTool } from './tools/zoneRangesProfile.tool';
import { workoutIntensityStrategyTool } from './tools/workoutIntensityStrategy.tool';
import { compareBlocksTool } from './tools/compareBlocks.tool';
import { trainingReadinessTool } from './tools/trainingReadiness.tool';
import { docsSearchTool } from './tools/docsSearch.tool';
import { docsGetTool } from './tools/docsGet.tool';
import { activitySearchTool } from './tools/activitySearch.tool';
import { skillActivateTool } from './tools/skillActivate.tool';
import { metricHistoryTool } from './tools/metricHistory.tool';
import { currentTimeTool } from './tools/currentTime.tool';
import { metricCurrentTool } from './tools/metricCurrent.tool';
import { metricCompareTool } from './tools/metricCompare.tool';
import { trainingWeekSummaryTool } from './tools/trainingWeekSummary.tool';
import { trainingBaselineTool } from './tools/trainingBaseline.tool';
import { trainingPlanContextTool } from './tools/trainingPlanContext.tool';
import { bestsSummaryTool } from './tools/bestsSummary.tool';
import { profileCurrentTool } from './tools/profileCurrent.tool';
import { askUserQuestionTool } from './tools/askUserQuestion.tool';
import { presentCoachPlanDraftTool } from './tools/presentCoachPlanDraft.tool';
import { planActiveTool } from './tools/planActive.tool';
import { planByIdTool } from './tools/planById.tool';
import { planRecentTool } from './tools/planRecent.tool';
import { presentPlanWorkoutAdjustmentDraftTool } from './tools/presentPlanWorkoutAdjustmentDraft.tool';
import { planDayViewTool } from './tools/planDayView.tool';
import { planExecutionContextTool } from './tools/planExecutionContext.tool';
import { activityDayViewTool } from './tools/activityDayView.tool';
import { activityDescriptionMutationTool } from './tools/mutationActivityDescription.tool';
import { activitySessionRpeMutationTool } from './tools/mutationActivitySessionRpe.tool';
import { activityPlanLinkMutationTool } from './tools/mutationActivityPlanLink.tool';
import { activityPlanUnlinkMutationTool } from './tools/mutationActivityPlanUnlink.tool';
import { planWorkoutStatusMutationTool } from './tools/mutationPlanWorkoutStatus.tool';
import { activityDeleteMutationTool } from './tools/mutationDeleteActivity.tool';
import { userFitnessMetricMutationTool } from './tools/mutationUserFitnessMetric.tool';
import { userBodyWeightMutationTool } from './tools/mutationUserBodyWeight.tool';
import { planLifecycleMutationTool } from './tools/mutationPlanLifecycle.tool';
import { planWorkoutUpdateMutationTool } from './tools/mutationPlanWorkoutUpdate.tool';
import { planWorkoutPostponeMutationTool } from './tools/mutationPlanWorkoutPostpone.tool';
import { planWorkoutAddMutationTool } from './tools/mutationPlanWorkoutAdd.tool';
import { coachDecisionDraftTool } from './tools/coachDecisionDraft.tool';
import { coachDecisionApplyTool } from './tools/coachDecisionApply.tool';
import { competitionEventsListTool } from './tools/competitionEventsList.tool';
import { competitionImpactResolveTool } from './tools/competitionImpactResolve.tool';
import { competitionEventMutationTool } from './tools/mutationCompetitionEvent.tool';
import { integrationStatusTool } from './tools/integrationStatus.tool';
import { trainingDataCoverageTool } from './tools/trainingDataCoverage.tool';
import { coachTaskSubmitResultTool } from './tools/coachTaskSubmitResult.tool';
import { trainingAggregateTool } from './tools/trainingAggregate.tool';
import { presentTrainingVisualizationTool } from './tools/presentTrainingVisualization.tool';
import { planProposalPreviewTool } from './tools/planProposalPreview.tool';
import { planSuitabilityAssessTool } from './tools/planSuitabilityAssess.tool';
import { memorySearchTool } from './tools/memorySearch.tool';
import { webSearchTool } from './tools/webSearch.tool';
import { webFetchTool } from './tools/webFetch.tool';

/**
 * AI Coach 可用工具清单注册表
 *
 * 说明：
 * - 这里返回的是“可暴露给模型调用的工具集合”
 * - 默认以只读查询为主；写操作须包在 mutationToolFactory 内并落入 CoachAction 审计链（见 mutation_*）
 */
export function sortToolsBySkillPreference(
  tools: AiToolDef[],
  activeSkill?: ActiveCoachSkill | null,
) {
  if (!activeSkill?.suggestedTools?.length) return tools;

  const preferred = activeSkill.suggestedTools;
  const scoreOf = (tool: AiToolDef) => {
    const index = preferred.findIndex((name) => toolMatchesName(tool, name));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return [...tools].sort((a, b) => {
    const scoreDelta = scoreOf(a) - scoreOf(b);
    if (scoreDelta !== 0) return scoreDelta;
    return a.name.localeCompare(b.name);
  });
}

const CORE_ALWAYS_ON_TOOL_NAMES = [
  'skill_activate',
  'ask_user_question',
  'fitness.methods',
  'memory.search',
  'web.search',
  'web.fetch',
  'coach_task_submit_result',
];

const BRANCH_ALWAYS_ON_TOOL_NAMES = [
  'coach_decision_draft',
  'coach_decision_apply',
];

function toolAppliesToSkill(
  tool: AiToolDef,
  activeSkill?: ActiveCoachSkill | null,
): boolean {
  if (!activeSkill || !tool.applicableSkills?.length) return true;
  return tool.applicableSkills.some(
    (skillName) => skillName.toLowerCase() === activeSkill.name.toLowerCase(),
  );
}

export function scopeToolsByActiveSkill(
  tools: AiToolDef[],
  activeSkill?: ActiveCoachSkill | null,
): AiToolDef[] {
  if (!activeSkill) return tools;

  const suggestedTools = activeSkill.suggestedTools ?? [];
  const alwaysOnNames = [
    ...CORE_ALWAYS_ON_TOOL_NAMES,
    ...BRANCH_ALWAYS_ON_TOOL_NAMES,
  ];

  const scoped = tools.filter((tool) => {
    if (alwaysOnNames.some((name) => toolMatchesName(tool, name))) {
      return true;
    }

    const applies = toolAppliesToSkill(tool, activeSkill);
    if (!applies) return false;

    if (tool.applicableSkills?.length) return true;

    return suggestedTools.some((name) => toolMatchesName(tool, name));
  });

  // 防御性兜底：如果 skill 配置异常导致筛空，则回退到原集合。
  return scoped.length > 0 ? scoped : tools;
}

/** Static catalog: inspecting names must not execute permission checks or tools. */
export const COACH_TOOL_DEFINITIONS: readonly AiToolDef[] = [
  coachTaskSubmitResultTool,
  askUserQuestionTool,
  fitnessMethodsTool,
  fitnessEvidenceTool,
  fitnessCalculateTool,
  fitnessApplyTool,
  fitnessTrackTool,
  presentCoachPlanDraftTool,
  planSuitabilityAssessTool,
  presentPlanWorkoutAdjustmentDraftTool,
  coachDecisionDraftTool,
  coachDecisionApplyTool,
  planProposalPreviewTool,
  planActiveTool,
  planByIdTool,
  planRecentTool,
  planDayViewTool,
  planExecutionContextTool,
  competitionEventsListTool,
  competitionImpactResolveTool,
  competitionEventMutationTool,
  skillActivateTool,
  activityByHashIdTool,
  activitySeriesTool,
  trainingAggregateTool,
  presentTrainingVisualizationTool,
  pmcRangeTool,
  zonesProfileTool,
  zoneRangesProfileTool,
  workoutIntensityStrategyTool,
  compareBlocksTool,
  trainingReadinessTool,
  docsSearchTool,
  docsGetTool,
  activitySearchTool,
  activityDayViewTool,
  metricHistoryTool,
  metricCurrentTool,
  metricCompareTool,
  currentTimeTool,
  trainingBaselineTool,
  trainingPlanContextTool,
  trainingWeekSummaryTool,
  bestsSummaryTool,
  profileCurrentTool,
  integrationStatusTool,
  trainingDataCoverageTool,
  memorySearchTool,
  webSearchTool,
  webFetchTool,
  activityDescriptionMutationTool,
  activitySessionRpeMutationTool,
  activityPlanLinkMutationTool,
  activityPlanUnlinkMutationTool,
  planWorkoutStatusMutationTool,
  activityDeleteMutationTool,
  userFitnessMetricMutationTool,
  userBodyWeightMutationTool,
  planLifecycleMutationTool,
  planWorkoutUpdateMutationTool,
  planWorkoutPostponeMutationTool,
  planWorkoutAddMutationTool,
];

export async function getCoachTools(args: {
  ctx: AiToolContext;
  activeSkill?: ActiveCoachSkill | null;
  /** 为 false 时返回全部 enabled 工具，由 runtime 按步 scope（支持 skill.activate 后换工具集） */
  scopeBySkill?: boolean;
  /**
   * Server-owned tasks have a fixed capability envelope. Filter the static
   * catalog before evaluating enablement so an anonymous or restricted task
   * never probes unrelated user-bound capabilities.
   */
  candidateToolNames?: readonly string[];
}): Promise<AiToolDef[]> {
  const enabled: AiToolDef[] = [];
  const candidates = args.candidateToolNames
    ? new Set(args.candidateToolNames)
    : null;
  for (const tool of COACH_TOOL_DEFINITIONS) {
    if (candidates && !candidates.has(tool.name)) continue;
    if (args.ctx.branchId && tool.kind === 'mutation') continue;
    if (await isAiToolEnabled(tool, args.ctx)) enabled.push(tool);
  }

  const scoped =
    args.scopeBySkill === false
      ? enabled
      : scopeToolsByActiveSkill(enabled, args.activeSkill);

  return sortToolsBySkillPreference(scoped, args.activeSkill);
}
