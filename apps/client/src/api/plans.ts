import { apiFetch, ApiFetchError } from "@/lib/api";
import type {
  WorkoutDefinitionInput,
  WorkoutStructure,
  WorkoutStructureKind,
} from "@shared/workout-structure";
import type { WorkoutSummary } from "@shared/workout-summary";
import type { VdotPlanDraftV1 } from "@shared/vdot-plan";

// 计划状态 定义
// DRAFT 草稿，
// SCHEDULED 已排期，
// ACTIVE 进行中，
// PAUSED 暂停，
// COMPLETED 完成，
// CANCELLED 取消，
// SUPERSEDED 已替代
export type PlanStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "SUPERSEDED";

/** 进行中或暂停：允许调整课次日程、顺延等（与 DRAFT/COMPLETED/CANCELLED 区分） */
export function isPlanScheduleMutable(status: PlanStatus): boolean {
  return status === "SCHEDULED" || status === "ACTIVE" || status === "PAUSED";
}

/** 草稿或暂停：允许改课表内容。ACTIVE 走执行态，不在详情里直接改 DSL。 */
export function isPlanContentEditable(status: PlanStatus): boolean {
  return status === "DRAFT" || status === "SCHEDULED" || status === "PAUSED";
}

/** 草稿或已暂停：可激活为进行中（与后端 activatePlan 一致） */
export function canActivatePlan(status: PlanStatus): boolean {
  return status === "DRAFT" || status === "PAUSED";
}

// 计划来源类型 定义
// MANUAL 手动创建，
// AI 人工智能创建，
// GENERATED 自动生成，
// IMPORTED 导入，
// TEMPLATE 模板
export type PlanSourceType =
  | "MANUAL"
  | "AI"
  | "GENERATED"
  | "IMPORTED"
  | "TEMPLATE";

export type PlanWorkoutStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "DONE"
  | "SKIPPED"
  | "MOVED";

export type PlanWorkoutMovedBy = "USER" | "COACH";

export function isWorkoutDone(status: PlanWorkoutStatus): boolean {
  return status === "DONE";
}

export function isWorkoutSkipped(status: PlanWorkoutStatus): boolean {
  return status === "SKIPPED";
}

export function isWorkoutInProgress(status: PlanWorkoutStatus): boolean {
  return status === "IN_PROGRESS";
}

export function isWorkoutMoved(status: PlanWorkoutStatus): boolean {
  return status === "MOVED";
}

/** 已完成或已跳过：不可顺延 */
export function isWorkoutDoneOrSkipped(status: PlanWorkoutStatus): boolean {
  return status === "DONE" || status === "SKIPPED";
}

/** 仍为计划或进行中（常见「待执行」队列） */
export function isWorkoutPlannedOrInProgress(
  status: PlanWorkoutStatus,
): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS";
}

/** 单次遍历统计各课次状态数量（状态分支集中在一处，避免页面多处 filter） */
export type PlanWorkoutStatusRollup = {
  planned: number;
  inProgress: number;
  done: number;
  skipped: number;
  moved: number;
};

export function rollupPlanWorkoutStatuses(
  workouts: Array<{ status: PlanWorkoutStatus }>,
): PlanWorkoutStatusRollup {
  const r: PlanWorkoutStatusRollup = {
    planned: 0,
    inProgress: 0,
    done: 0,
    skipped: 0,
    moved: 0,
  };
  for (const { status } of workouts) {
    switch (status) {
      case "PLANNED":
        r.planned++;
        break;
      case "IN_PROGRESS":
        r.inProgress++;
        break;
      case "DONE":
        r.done++;
        break;
      case "SKIPPED":
        r.skipped++;
        break;
      case "MOVED":
        r.moved++;
        break;
    }
  }
  return r;
}

export type PlanWorkoutActivityLinkSource = "MANUAL" | "AUTO" | "AI";
export type PlanWorkoutActivityLinkRole = "PRIMARY" | "SECONDARY";

/** 计划训练「期望负荷」的主导轨道 */
export type PlanLoadSource =
  | "POWER"
  | "HR"
  | "PACE"
  | "RPE"
  | "SESSION_RPE"
  | "NONE";

/** 活动「实际负荷」的来源轨道（与 UserProfile.loadSources 同口径） */
export type ActualLoadSource = "POWER" | "HEART_RATE" | "PACE" | "SESSIONRPE";

/** 期望负荷估算的输入快照（仅在结构化弹窗里展示明细时用） */
export type PlanWorkoutEstimatedLoadInputs = {
  thresholds: {
    ftp: number | null;
    cp: number | null;
    maxHeartRate?: number | null;
    lthr: number | null;
    runThresholdPaceSecPerKm: number | null;
    swimThresholdPaceSecPer100m: number | null;
  };
  bySteps: Array<{
    stepId: string | null;
    parentId: string | null;
    bucket: "POWER" | "HR" | "PACE" | "RPE";
    ifValue: number;
    durationSec: number;
    contribution: number;
    partialEstimate: boolean;
    reason?: string;
    thresholdSource?: "PROFILE" | "ESTIMATED_MAX_HR";
  }>;
  empty: boolean;
  mixedSource?: boolean;
  strength?: {
    formulaVersion: 1;
    durationMinutes: number;
    sessionRpeRating: number;
    rawAu: number;
    normalizedLoad: number;
  };
};

export type PlanSportType =
  | "RUN"
  | "CYCLING"
  | "SWIM"
  | "STRETCHING"
  | "UNKNOWN";

export type PlanWorkoutLink = {
  id: string;
  planId: string;
  planWorkoutId: string;
  activityId: number;
  source: PlanWorkoutActivityLinkSource;
  role: PlanWorkoutActivityLinkRole;
  linkedAt: string;
  unlinkedAt: string | null;
  /** PRIMARY 关联时在计划页展示跳转 */
  activity?: {
    hashId: string;
    title: string | null;
  } | null;
  /** PRIMARY link 上的活动实际负荷（按 loadSources 优先级取值） */
  actualLoad?: number | null;
  /** 实际值命中的来源轨道；与期望来源不一致时提示跨轨道对比 */
  actualLoadSource?: ActualLoadSource | null;
};

export type PlanWorkout = {
  id: string;
  planId: string | null;
  dayOffset: number;
  weekIndex: number;
  dayIndex: number;
  sessionIndex: number;
  scheduledDate: string | null;
  name?: string | null;
  text: string;
  notes?: string | null;
  sportType: PlanSportType;
  sportDefinitionCode?: string | null;
  structureKind: WorkoutStructureKind;
  dslVersion: number;
  structure: WorkoutStructure;
  summary: WorkoutSummary;
  status: PlanWorkoutStatus;
  completedAt?: string | null;
  skippedAt?: string | null;
  movedFromWorkoutId?: string | null;
  movedBy?: PlanWorkoutMovedBy | null;
  createdAt?: string;
  updatedAt?: string;
  blocks?: unknown[] | string | Record<string, unknown> | null;
  steps?: unknown[] | null;
  links?: PlanWorkoutLink[];
  /** 期望负荷快照（DRAFT 期始终为 null；ACTIVE/PAUSED 编辑时增量更新） */
  estimatedLoad?: number | null;
  /** 该课主导 target（按 IF² × sec 贡献加权 top1） */
  estimatedLoadSource?: PlanLoadSource | null;
  /** 期望负荷估算输入快照（含阈值快照与逐步贡献） */
  estimatedLoadInputs?: PlanWorkoutEstimatedLoadInputs | null;
  /** Server-derived permissions; write endpoints recheck them at execution. */
  capabilities?: { delete: boolean; postpone: boolean; skip: boolean };
  /** 期望负荷快照计算时刻 */
  estimatedLoadComputedAt?: string | null;
};

export type CreatePlanDto = {
  title: string;
  description?: string;
  goal?: string;
  sourceType?: PlanSourceType;
  generationMetadata?: Record<string, unknown>;
  periodWeeks: number;
  workouts: Array<{
    weekIndex: number;
    dayIndex: number;
    sessionIndex?: number;
    text?: string;
    definition?: WorkoutDefinitionInput;
    notes?: string;
    name?: string;
    sportType: PlanSportType;
    sportDefinitionCode?: string | null;
    blocks?: unknown[] | string | Record<string, unknown> | null;
  }>;
};

export type UpdatePlanDto = {
  title?: string;
  description?: string | null;
  goal?: string | null;
  periodWeeks?: number;
  workouts?: Array<{
    id?: string;
    weekIndex: number;
    dayIndex: number;
    sessionIndex?: number;
    text?: string;
    definition?: WorkoutDefinitionInput;
    notes?: string | null;
    name?: string | null;
    sportType: PlanSportType;
    sportDefinitionCode?: string | null;
    blocks?: unknown[] | string | Record<string, unknown> | null;
  }>;
  deletedWorkoutIds?: string[];
};

export type UpdatePlanWorkoutDto = {
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  text?: string;
  definition?: WorkoutDefinitionInput;
  notes?: string | null;
  name?: string | null;
  sportType: PlanSportType;
  sportDefinitionCode?: string | null;
  reason?: string;
  blocks?: unknown[] | string | Record<string, unknown> | null;
};

export type UpdatePlanWorkoutStatusDto = {
  status: PlanWorkoutStatus;
};

export type TrainingPlanSummary = {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  goal?: string | null;
  sourceType: PlanSourceType;
  generationMetadata?: Record<string, unknown> | null;
  status: PlanStatus;
  capabilities?: { delete: boolean };
  periodWeeks: number;
  startDate: string | null;
  endDate: string | null;
  currentWeekIndex: number | null;
  currentDayIndex: number | null;
  createdAt: string;
  updatedAt: string;
  workoutCount: number;
  completedWorkoutCount: number;
  /** 仅已完成（DONE）课次的期望负荷快照合计 */
  estimatedLoadTotal?: number;
  /** 仅 DONE 课次 PRIMARY 关联活动的实际负荷合计（PMC 同口径） */
  actualLoadTotal?: number;
  /** doneCount / workoutCount，0..100 */
  sessionCompletionRate?: number;
  /** 仅 DONE 课次：actualLoadTotal / estimatedLoadTotal；无可对比基准时为 null */
  complianceRate?: number | null;
};

/** GET /plans 顶部概览用：跨计划加权完成率与整体负荷合规 */
export type ListPlansAggregates = {
  /** Σdone / Σworkouts，与逐计划简单算术平均不同 */
  weightedSessionCompletionRate: number;
  /** Σactual / Σestimated（仅 DONE 课次合计），无基准时为 null */
  aggregateLoadCompliance: number | null;
};

export type TrainingPlanDetail = {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  goal?: string | null;
  sourceType: PlanSourceType;
  generationMetadata?: Record<string, unknown> | null;
  status: PlanStatus;
  capabilities?: { delete: boolean };
  periodWeeks: number;
  startDate: string | null;
  endDate: string | null;
  activatedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  currentWeekIndex: number | null;
  currentDayIndex: number | null;
  derivedFromShareId?: string | null;
  derivedFromLineageId?: string | null;
  rootLineageId?: string | null;
  createdAt: string;
  updatedAt: string;
  workouts: PlanWorkout[];
};

export type ActivePlanResponse = {
  plan: TrainingPlanDetail | null;
  currentWeekIndex: number | null;
  currentDayIndex: number | null;
  status: PlanStatus | null;
  startDate: string | null;
  endDate: string | null;
} | null;

type ListPlansResult = {
  plans: TrainingPlanSummary[];
  aggregates: ListPlansAggregates;
};

type PlanResult = {
  plan: TrainingPlanDetail;
};

export type VdotPlanImportPreview = {
  draft: VdotPlanDraftV1;
  expiresAt: string;
  summary: {
    title: string;
    goal: string;
    vdot: number;
    periodWeeks: number;
    workoutCount: number;
    startDate: string;
    generatedAt: string;
  };
};

type WorkoutResult = {
  workout: PlanWorkout;
};

type WorkoutLinksResult = {
  links: PlanWorkoutLink[];
};

type DeletePlanResult = {
  success: true;
};

export async function createPlan(dto: CreatePlanDto) {
  const data = (await apiFetch("/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  })) as PlanResult | undefined;

  return data?.plan;
}

export type PlanSharePreview = {
  publicId: string;
  lineagePublicId: string;
  slug?: string;
  origin: "USER_SHARE" | "OFFICIAL";
  visibility: "UNLISTED" | "CATALOG";
  version: number;
  title: string;
  description: string | null;
  goal: string | null;
  periodWeeks: number;
  locale: string;
  sportTypes: string[];
  workoutCount: number;
  trainingDaysPerWeek: number;
  loadPersonalized?: boolean;
  workouts: Array<{
    weekIndex: number;
    dayIndex: number;
    sessionIndex: number;
    sportType: string;
    name: string | null;
    notes: string | null;
    structureKind: WorkoutStructureKind;
    structure?: WorkoutStructure;
    durationSeconds?: number | null;
    previewLoad?: number | null;
    estimatedLoad?: number | null;
    estimatedLoadSource?: string | null;
  }>;
  headVersion?: number | null;
  parentLineagePublicId?: string | null;
};

export type PlanShareResult = {
  reused: boolean;
  share: {
    publicId: string;
    version: number;
    status: string;
    payloadHash: string;
    title: string;
  };
  lineage: {
    publicId: string;
    origin: string;
    visibility: string;
    status: string;
    parentLineageId: string | null;
  };
};

export async function createPlanShare(planId: string) {
  return (await apiFetch(`/plans/${planId}/shares`, {
    method: "POST",
  })) as PlanShareResult | undefined;
}

export async function getPublicPlanSharePreview(publicId: string) {
  return (await apiFetch(
    `/public/plan-shares/${encodeURIComponent(publicId)}`,
    { method: "GET", suppressErrorToast: true },
  )) as PlanSharePreview | undefined;
}

export async function getPublicPlanShareLineagePreview(
  publicId: string,
  version?: number,
) {
  const query =
    typeof version === "number"
      ? `?version=${encodeURIComponent(version)}`
      : "";
  return (await apiFetch(
    `/public/plan-share-lineages/${encodeURIComponent(publicId)}${query}`,
    { method: "GET", suppressErrorToast: true },
  )) as PlanSharePreview | undefined;
}

export async function getPlanSharePublicPreview(publicId: string) {
  try {
    return await getPublicPlanShareLineagePreview(publicId);
  } catch (error) {
    if (error instanceof ApiFetchError && error.status === 404) {
      return getPublicPlanSharePreview(publicId);
    }
    throw error;
  }
}

export async function getViewerPlanSharePreview(publicId: string) {
  return (await apiFetch(
    `/plan-shares/${encodeURIComponent(publicId)}/preview`,
    { method: "GET", suppressErrorToast: true },
  )) as PlanSharePreview | undefined;
}

export async function importPlanShare(publicId: string, share = false) {
  const data = (await apiFetch(
    `/plan-shares/${encodeURIComponent(publicId)}/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share }),
    },
  )) as { plan: TrainingPlanDetail; share: PlanShareResult | null } | undefined;
  return data;
}

export async function revokePlanShare(publicId: string) {
  return apiFetch(`/plan-shares/${encodeURIComponent(publicId)}/revoke`, {
    method: "POST",
  });
}

export async function revokePlanShareLineage(publicId: string) {
  return apiFetch(
    `/plan-share-lineages/${encodeURIComponent(publicId)}/revoke`,
    { method: "POST" },
  );
}

export async function getVdotPlanImportPreview(token: string) {
  return (await apiFetch(
    `/plan-import-drafts/${encodeURIComponent(token)}/preview`,
    { method: "GET" },
  )) as VdotPlanImportPreview | undefined;
}

export async function importVdotPlanDraft(token: string) {
  const data = (await apiFetch(
    `/plan-import-drafts/${encodeURIComponent(token)}/import`,
    { method: "POST" },
  )) as PlanResult | undefined;
  return data?.plan;
}

export async function updatePlan(planId: string, dto: UpdatePlanDto) {
  const data = (await apiFetch(`/plans/${planId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  })) as PlanResult | undefined;

  return data?.plan;
}

export async function getListPlans(): Promise<{
  plans: TrainingPlanSummary[];
  aggregates: ListPlansAggregates;
}> {
  const data = (await apiFetch("/plans", {
    method: "GET",
  })) as ListPlansResult | undefined;
  return {
    plans: data?.plans ?? [],
    aggregates: data?.aggregates ?? {
      weightedSessionCompletionRate: 0,
      aggregateLoadCompliance: null,
    },
  };
}

export async function getPlanDetail(
  planId: string,
): Promise<TrainingPlanDetail | undefined> {
  const data = (await apiFetch(`/plans/${planId}`, {
    method: "GET",
  })) as PlanResult | undefined;
  return data?.plan;
}

export async function getActivePlan(): Promise<ActivePlanResponse> {
  const data = (await apiFetch("/plans/active", {
    method: "GET",
  })) as { plan: TrainingPlanDetail | null } | undefined;

  if (!data?.plan) return null;

  return {
    plan: data.plan,
    currentWeekIndex: data.plan.currentWeekIndex,
    currentDayIndex: data.plan.currentDayIndex,
    status: data.plan.status,
    startDate: data.plan.startDate,
    endDate: data.plan.endDate,
  };
}

export async function getPlanWorkoutDetail(planId: string, workoutId: string) {
  const data = (await apiFetch(`/plans/${planId}/workouts/${workoutId}`, {
    method: "GET",
  })) as WorkoutResult | undefined;
  return data?.workout;
}

export async function updatePlanWorkout(
  planId: string,
  workoutId: string,
  dto: UpdatePlanWorkoutDto,
) {
  const data = (await apiFetch(`/plans/${planId}/workouts/${workoutId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  })) as WorkoutResult | undefined;
  return data?.workout;
}

export async function updatePlanWorkoutStatus(
  planId: string,
  workoutId: string,
  dto: UpdatePlanWorkoutStatusDto,
) {
  const data = (await apiFetch(
    `/plans/${planId}/workouts/${workoutId}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    },
  )) as WorkoutResult | undefined;
  return data?.workout;
}

export async function activatePlan(planId: string, startDate?: string) {
  const data = (await apiFetch(`/plans/${planId}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startDate }),
  })) as PlanResult | undefined;

  return data?.plan;
}

export async function pausePlan(planId: string, reason?: string) {
  const data = (await apiFetch(`/plans/${planId}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  })) as PlanResult | undefined;

  return data?.plan;
}

export async function completePlan(
  planId: string,
  completedAt?: string,
  reason?: string,
) {
  const data = (await apiFetch(`/plans/${planId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completedAt, reason }),
  })) as PlanResult | undefined;

  return data?.plan;
}

export async function cancelPlan(planId: string, reason?: string) {
  const data = (await apiFetch(`/plans/${planId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  })) as PlanResult | undefined;

  return data?.plan;
}

export async function getPlanWorkoutLinks(planId: string, workoutId: string) {
  const data = (await apiFetch(`/plans/${planId}/workouts/${workoutId}/links`, {
    method: "GET",
  })) as WorkoutLinksResult | undefined;
  return data?.links ?? [];
}

export async function deletePlan(planId: string) {
  return (await apiFetch(`/plans/${planId}`, {
    method: "DELETE",
  })) as DeletePlanResult | undefined;
}

/** 计划维度的 estimated vs actual 复盘汇总（来自 GET /plans/:planId/summary） */
export type PlanSummarySportBucket = "RUN" | "CYCLING" | "SWIM" | "OTHER";

export type PlanSummaryWeek = {
  weekIndex: number;
  workoutCount: number;
  doneCount: number;
  plannedCount: number;
  inProgressCount: number;
  skippedCount: number;
  movedCount: number;
  estimatedLoad: number;
  actualLoad: number;
  /** actualLoad / estimatedLoad，0..100；空周时为 0 */
  complianceRate: number;
};

export type PlanSummarySport = {
  sport: PlanSummarySportBucket;
  workoutCount: number;
  doneCount: number;
  estimatedLoad: number;
  actualLoad: number;
  complianceRate: number;
};

export type PlanSummary = {
  planId: string;
  status: PlanStatus;
  periodWeeks: number | null;
  totals: {
    workoutCount: number;
    doneCount: number;
    plannedCount: number;
    inProgressCount: number;
    skippedCount: number;
    movedCount: number;
    /** 仅 DONE 课次期望负荷合计 */
    estimatedLoad: number;
    /** 仅 DONE 课次实际负荷合计 */
    actualLoad: number;
    /** doneCount / workoutCount，0..100 */
    completionRate: number;
    /** 仅 DONE 课次：actual / estimated；estimated=0 时为 null */
    complianceRate: number | null;
  };
  weeks: PlanSummaryWeek[];
  bySport: PlanSummarySport[];
};

export async function getPlanSummary(
  planId: string,
): Promise<PlanSummary | undefined> {
  const data = (await apiFetch(`/plans/${planId}/summary`, {
    method: "GET",
  })) as { summary: PlanSummary } | undefined;
  return data?.summary;
}

export type CreateScheduledWorkoutDto = {
  scheduledDate: string;
  sportType: PlanSportType;
  sportDefinitionCode?: string | null;
  text?: string;
  definition?: WorkoutDefinitionInput;
  name?: string | null;
  notes?: string | null;
  blocks?: unknown;
};

export type ScheduledWorkoutsResponse = {
  inPlan: PlanWorkout[];
  independent: PlanWorkout[];
};

export async function getScheduledWorkouts(
  start: string,
  end: string,
): Promise<ScheduledWorkoutsResponse> {
  const params = new URLSearchParams({ start, end });
  const data = (await apiFetch(
    `/plans/scheduled-workouts?${params.toString()}`,
    { method: "GET" },
  )) as ScheduledWorkoutsResponse | undefined;
  return {
    inPlan: data?.inPlan ?? [],
    independent: data?.independent ?? [],
  };
}

export async function createIndependentWorkout(dto: CreateScheduledWorkoutDto) {
  const data = (await apiFetch("/plans/workouts/independent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  })) as WorkoutResult | undefined;
  return data?.workout;
}

export async function getIndependentWorkoutDetail(workoutId: string) {
  const data = (await apiFetch(`/plans/workouts/independent/${workoutId}`, {
    method: "GET",
  })) as WorkoutResult | undefined;
  return data?.workout;
}

export async function deleteIndependentWorkout(workoutId: string) {
  return (await apiFetch(`/plans/workouts/independent/${workoutId}`, {
    method: "DELETE",
  })) as { success: true } | undefined;
}

export async function createPlanWorkout(
  planId: string,
  dto: CreateScheduledWorkoutDto,
) {
  const data = (await apiFetch(`/plans/${planId}/workouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dto),
  })) as WorkoutResult | undefined;
  return data?.workout;
}

export async function attachWorkoutToPlan(planId: string, workoutId: string) {
  const data = (await apiFetch(
    `/plans/${planId}/workouts/${workoutId}/attach`,
    {
      method: "POST",
    },
  )) as WorkoutResult | undefined;
  return data?.workout;
}
