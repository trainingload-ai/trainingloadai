import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

/**
 * 活动入库 / PMC 依赖侧缓存（不含导入批次自身 query）。
 *
 * 手动 QA：变更活动后应在 Network 中看到 DELETE/RPE 等请求返回完成后，
 * 再出现 `/pmc/status`；服务端对应 mutation 已 `await recalculatePMC`，避免抢先 refetch 读到全 0。
 */
export async function invalidateActivityDerivedCaches(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.root.activities }),
    qc.invalidateQueries({ queryKey: queryKeys.root.activityStats }),
    qc.invalidateQueries({ queryKey: queryKeys.pmc.data() }),
    qc.invalidateQueries({ queryKey: queryKeys.pmc.fitnessStatus() }),
    qc.invalidateQueries({ queryKey: queryKeys.pmc.extremes() }),
    qc.invalidateQueries({ queryKey: queryKeys.home.v2() }),
    qc.invalidateQueries({ queryKey: queryKeys.home.recentActivities() }),
    qc.invalidateQueries({ queryKey: queryKeys.coach.recentActivities() }),
    qc.invalidateQueries({ queryKey: queryKeys.timezone.prompt() }),
    qc.invalidateQueries({ queryKey: queryKeys.root.activitiesLayer }),
    qc.invalidateQueries({ queryKey: queryKeys.root.activitiesMonthly }),
  ]);
}

/**
 * 导入批次 + 后处理整体完成（materialize / PMC 等结束后）刷新首页、列表与负荷相关缓存。
 */
export async function invalidateAfterActivityPipelineComplete(
  qc: QueryClient,
  options?: { batchId?: string },
) {
  const extra: Promise<unknown>[] = [];
  if (options?.batchId) {
    extra.push(
      qc.invalidateQueries({
        queryKey: queryKeys.import.batch(options.batchId),
      }),
      qc.invalidateQueries({
        queryKey: queryKeys.import.batchItems(options.batchId),
      }),
    );
  }
  await Promise.all([...extra, invalidateActivityDerivedCaches(qc)]);
}

/** 与计划文档命名对齐：导入流水线完成后刷新活动衍生缓存 */
export const invalidateAfterActivityImportComplete =
  invalidateAfterActivityPipelineComplete;

/** 当前激活计划 + 所有 plan-detail 子查询（推迟/跳过等仅刷新计划树） */
export async function invalidateActivePlanAndPlanDetails(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.plans.active() }),
    qc.invalidateQueries({ queryKey: queryKeys.root.planDetail }),
  ]);
}

/** 仅刷新计划列表与当前 ACTIVE（创建计划等轻量变更） */
export async function invalidatePlanListsAndActive(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.plans.list() }),
    qc.invalidateQueries({ queryKey: queryKeys.plans.active() }),
    qc.invalidateQueries({ queryKey: queryKeys.plans.legacyPlans() }),
  ]);
}

/**
 * 计划结构或状态变更后的通用失效（含 plan-detail / plan-workout-detail 前缀）。
 */
export async function invalidateAfterPlanMutation(
  qc: QueryClient,
  options?: {
    planId?: string;
    workout?: { planId: string; workoutId: string };
    /** 默认 true：失效 plan-detail、plan-workout-detail 整棵子树 */
    includePlanDetailTrees?: boolean;
  },
) {
  const includeTrees = options?.includePlanDetailTrees !== false;

  const tasks: Promise<unknown>[] = [
    qc.invalidateQueries({ queryKey: queryKeys.plans.list() }),
    qc.invalidateQueries({ queryKey: queryKeys.plans.active() }),
    qc.invalidateQueries({ queryKey: queryKeys.plans.legacyPlans() }),
  ];

  if (includeTrees) {
    tasks.push(
      qc.invalidateQueries({ queryKey: queryKeys.root.planDetail }),
      qc.invalidateQueries({ queryKey: queryKeys.root.planWorkoutDetail }),
    );
  }

  if (options?.planId) {
    tasks.push(
      qc.invalidateQueries({
        queryKey: queryKeys.plans.detail(options.planId),
      }),
    );
  }

  if (options?.workout) {
    const { planId: wpId, workoutId } = options.workout;
    tasks.push(
      qc.invalidateQueries({
        queryKey: queryKeys.plans.workoutDetail(wpId, workoutId),
      }),
    );
  }

  await Promise.all(tasks);
}
