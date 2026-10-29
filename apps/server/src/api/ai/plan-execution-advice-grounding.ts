export type PlanExecutionAdviceGrounding = {
  hasActivePlan: boolean;
  currentPlanWeekIndex: number | null;
  hasActiveCompetitionInfluence: boolean;
  completedWorkoutCount: number;
  recordedActivityCount: number;
  recentActivityDayPeriod: string | null;
  currentWeekElapsedDays: number;
  currentWeekComparison:
    | 'WEEK_TO_DATE_VS_FULL_PREVIOUS_WEEK'
    | 'FULL_WEEK_VS_FULL_PREVIOUS_WEEK';
};

export function shouldUseDeterministicPlanAdvice(
  surface: string,
  grounding: PlanExecutionAdviceGrounding,
) {
  return surface === 'PLAN_SIDEBAR' && !grounding.hasActivePlan;
}

const UNSUPPORTED_COMPETITION_PHASE_CLAIM =
  /(?:比赛|赛事|竞赛|備賽|备赛|減量|减量|赛后恢复|賽後恢復).{0,6}(?:期|阶段|階段|窗口)|\b(?:race|competition|event|taper|post[- ]?race recovery)\s+(?:phase|period|window)\b/i;
const INCOMPLETE_WEEK_DROP_CLAIM =
  /(?:本周|这周|本週|這週).{0,40}(?:骤降|驟降|暴跌|下降|降低|减少|減少|跌至|降至|较上周.{0,12}(?:偏低|更低|少)|較上週.{0,12}(?:偏低|更低|少))|\bthis week(?:'s)?\b.{0,60}\b(?:sharp(?:ly)?|sudden(?:ly)?|plummet(?:ed)?|drop(?:ped)?|declin(?:e|ed)|fell|lower than last week)\b/i;
const COMPLETED_WORKOUT_CLAIM =
  /(?:今天|今日|今早|上午|下午|今晚).{0,12}(?:训练|訓練|课次|課次|跑|骑|騎|游泳).{0,8}(?:已完成|完成了)|(?:已完成|完成了).{0,12}(?:训练|訓練|课次|課次|跑|骑|騎|游泳)|(?:今天|今日|今早|上午|下午|今晚).{0,12}(?:已|已经|已經).{0,8}(?:跑|骑|騎|游泳).{0,8}[0-9]+(?:\.[0-9]+)?\s*(?:分钟|分鐘|公里|千米|km)|\b(?:today(?:'s)?|this (?:morning|afternoon|evening)).{0,24}(?:workout|session|run|ride|swim).{0,16}\b(?:complete|completed|done)\b/i;
const COMPLETED_PLANNED_WORKOUT_CLAIM =
  /(?:计划|計劃|课表|課表).{0,12}(?:训练|訓練|课次|課次|跑|骑|騎|游泳).{0,8}(?:已完成|完成了)|(?:已完成|完成了).{0,12}(?:计划|計劃|课表|課表).{0,12}(?:训练|訓練|课次|課次|跑|骑|騎|游泳)|\bplanned\s+(?:workout|session|run|ride|swim).{0,16}\b(?:complete|completed|done)\b/i;
const MORNING_ACTIVITY_CLAIM =
  /(?:今早|早晨|晨跑|晨骑|晨騎|晨练|晨練|上午).{0,20}(?:活动|活動|训练|訓練|跑|骑|騎|游泳|完成)|\b(?:morning|a\.m\.).{0,16}(?:activity|workout|session|run|ride|swim)\b/i;
const ARABIC_PLAN_WEEK_CLAIM =
  /第\s*([0-9]{1,3})\s*(?:\/\s*[0-9]{1,3}\s*)?(?:周|週)|\bweek\s*(?:number\s*)?([0-9]{1,3})\b/gi;
const CHINESE_PLAN_WEEK_CLAIM =
  /第\s*([一二三四五六七八九十]{1,3})\s*(?:周|週)/g;

function chineseWeekNumber(value: string): number | null {
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (value === '十') return 10;
  const [beforeTen, afterTen] = value.split('十');
  if (value.includes('十')) {
    const tens = beforeTen ? digits[beforeTen] : 1;
    const ones = afterTen ? digits[afterTen] : 0;
    return tens && ones !== undefined ? tens * 10 + ones : null;
  }
  return digits[value] ?? null;
}

function claimedPlanWeeks(text: string): number[] {
  const weeks: number[] = [];
  for (const match of text.matchAll(ARABIC_PLAN_WEEK_CLAIM)) {
    const week = Number(match[1] ?? match[2]);
    if (Number.isInteger(week) && week > 0) weeks.push(week);
  }
  for (const match of text.matchAll(CHINESE_PLAN_WEEK_CLAIM)) {
    const week = chineseWeekNumber(match[1]);
    if (week) weeks.push(week);
  }
  return weeks;
}

export function validatePlanExecutionAdviceGrounding(params: {
  summary: string;
  tags: string[];
  grounding: PlanExecutionAdviceGrounding;
}): { valid: boolean; reason: string | null } {
  const text = [params.summary, ...params.tags].join(' ');
  const planWeekClaims = claimedPlanWeeks(text);
  if (planWeekClaims.length > 0) {
    const hasConflictingWeekClaim =
      params.grounding.currentPlanWeekIndex == null ||
      planWeekClaims.some(
        (week) => week !== params.grounding.currentPlanWeekIndex,
      );
    if (hasConflictingWeekClaim) {
      return { valid: false, reason: 'CURRENT_PLAN_WEEK_CONFLICT' };
    }
  }
  if (
    !params.grounding.hasActiveCompetitionInfluence &&
    UNSUPPORTED_COMPETITION_PHASE_CLAIM.test(text)
  ) {
    return { valid: false, reason: 'UNSUPPORTED_COMPETITION_PHASE' };
  }
  if (
    params.grounding.currentWeekComparison ===
      'WEEK_TO_DATE_VS_FULL_PREVIOUS_WEEK' &&
    INCOMPLETE_WEEK_DROP_CLAIM.test(text)
  ) {
    return { valid: false, reason: 'INCOMPLETE_WEEK_DROP_CLAIM' };
  }
  if (
    params.grounding.completedWorkoutCount === 0 &&
    COMPLETED_PLANNED_WORKOUT_CLAIM.test(text)
  ) {
    return { valid: false, reason: 'UNSUPPORTED_WORKOUT_COMPLETION' };
  }
  if (
    params.grounding.completedWorkoutCount === 0 &&
    params.grounding.recordedActivityCount === 0 &&
    COMPLETED_WORKOUT_CLAIM.test(text)
  ) {
    return { valid: false, reason: 'UNSUPPORTED_WORKOUT_COMPLETION' };
  }
  if (
    params.grounding.recentActivityDayPeriod === 'afternoon' &&
    MORNING_ACTIVITY_CLAIM.test(text)
  ) {
    return { valid: false, reason: 'ACTIVITY_DAY_PERIOD_CONFLICT' };
  }
  return { valid: true, reason: null };
}
