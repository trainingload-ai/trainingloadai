import type { SportType } from '@prisma/client';
import type { IntervalsIcuEvent } from '@/integrations/intervals-icu/intervals-icu.client';
import type {
  PlanBlock,
  WorkRestBlock,
  WorkRestStep,
} from '@/api/workout/workout.service';

/** Intervals.icu 日历事件上的结构化 workout_doc。 */
export type IntervalsIcuWorkoutDoc = {
  steps?: IntervalsIcuWorkoutDocStep[];
  duration?: number;
};

/** workout_doc 单步：叶子（时长+目标）或带 reps 的重复组。 */
export type IntervalsIcuWorkoutDocStep = {
  text?: string;
  duration?: number;
  reps?: number;
  steps?: IntervalsIcuWorkoutDocStep[];
  power?: IntervalsIcuTargetSpec;
  hr?: IntervalsIcuTargetSpec;
  pace?: IntervalsIcuTargetSpec;
  cadence?: IntervalsIcuTargetSpec;
};

/** 功率/心率等目标区间规格（常为 %FTP）。 */
type IntervalsIcuTargetSpec = {
  start?: number;
  end?: number;
  value?: number;
  units?: string;
};

/** 从日历事件解析出的本地计划课草稿。 */
export type ParsedIntervalsCalendarWorkout = {
  scheduledDate: string;
  sportType: SportType;
  name: string | null;
  notes: string | null;
  blocks: PlanBlock[];
};

/** trim 后非空字符串，否则 null。 */
function cleanString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length ? text : null;
}

/** 事件本地日期 YYYY-MM-DD。 */
function eventDate(event: IntervalsIcuEvent) {
  const value =
    cleanString(event.start_date_local) ?? cleanString(event.end_date_local);
  return value ? value.slice(0, 10) : null;
}

/** Intervals 运动 type 字符串 → 我方 SportType。 */
export function mapIntervalsSportType(value: unknown): SportType {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('run')) return 'RUN' as SportType;
  if (
    text.includes('ride') ||
    text.includes('bike') ||
    text.includes('cycling')
  ) {
    return 'CYCLING' as SportType;
  }
  if (text.includes('swim')) return 'SWIM' as SportType;
  if (
    text.includes('yoga') ||
    text.includes('pilates') ||
    text.includes('stretch') ||
    text.includes('strength') ||
    text.includes('weight')
  ) {
    return 'STRETCHING' as SportType;
  }
  return 'UNKNOWN' as SportType;
}

/** 从步骤文案推断 WARMUP/WORK/REST 等。 */
function inferStepKind(text: string | null): WorkRestStep['stepKind'] {
  const normalized = String(text ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'WORK';
  if (normalized.includes('warm')) return 'WARMUP';
  if (normalized.includes('cool')) return 'COOLDOWN';
  if (normalized.includes('easy') || normalized.includes('recovery')) {
    return 'RECOVERY';
  }
  if (normalized.includes('rest')) return 'REST';
  return 'WORK';
}

/** REST/RECOVERY 视为休息块。 */
function isRestStepKind(stepKind: WorkRestStep['stepKind']) {
  return stepKind === 'REST' || stepKind === 'RECOVERY';
}

/** %FTP → 0–1 比例。 */
function ftpPercentToRatio(value: number) {
  return Math.max(0, value) / 100;
}

/** 仅映射 %FTP / 百分比功率目标。 */
function mapPowerTarget(
  power: IntervalsIcuTargetSpec | undefined,
): Pick<WorkRestStep, 'power' | 'primaryTargetMeta'> {
  if (!power || typeof power !== 'object') {
    return {};
  }
  const units = String(power.units ?? '').toLowerCase();
  if (!units.includes('ftp') && !units.includes('%')) {
    return {};
  }
  const start =
    typeof power.start === 'number'
      ? power.start
      : typeof power.value === 'number'
        ? power.value
        : null;
  const end =
    typeof power.end === 'number'
      ? power.end
      : typeof power.value === 'number'
        ? power.value
        : start;
  if (start == null || end == null) {
    return {};
  }
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const midpoint = (low + high) / 2;
  return {
    power: ftpPercentToRatio(midpoint),
    primaryTargetMeta: {
      kind: 'POWER_CUSTOM',
      value: low,
      valueHigh: high,
      unit: '%',
      zoneBasis: {
        source: 'intervals_icu_workout_doc',
        basis: 'FTP',
      },
    },
  };
}

/** 叶子步骤 → WorkRestStep（必须有 duration）。 */
function mapLeafStep(step: IntervalsIcuWorkoutDocStep): WorkRestStep | null {
  const duration =
    typeof step.duration === 'number' && step.duration > 0
      ? Math.round(step.duration)
      : null;
  if (duration == null) return null;

  const stepKind = inferStepKind(cleanString(step.text));
  const powerTarget = mapPowerTarget(step.power);

  return {
    duration,
    stepKind,
    durationMeta: {
      kind: 'TIME',
      value: duration,
      unit: 'SECONDS',
    },
    ...powerTarget,
  };
}

/** 单步 → PlanBlock（repeat 或 work/rest）。 */
function mapDocStepToBlock(step: IntervalsIcuWorkoutDocStep): PlanBlock | null {
  const reps =
    typeof step.reps === 'number' && step.reps > 0
      ? Math.round(step.reps)
      : null;
  const nested = Array.isArray(step.steps) ? step.steps : [];

  if (reps != null && nested.length > 0) {
    const children: WorkRestBlock[] = [];
    for (const child of nested) {
      const mapped = mapDocStepToBlock(child);
      if (!mapped) continue;
      if (mapped.type === 'repeat') {
        for (const nestedChild of mapped.children) {
          children.push(nestedChild);
        }
        continue;
      }
      children.push(mapped);
    }
    if (children.length === 0) return null;
    return {
      type: 'repeat',
      count: reps,
      children,
    };
  }

  const leaf = mapLeafStep(step);
  if (!leaf) return null;
  const blockType = isRestStepKind(leaf.stepKind) ? 'rest' : 'work';
  return {
    type: blockType,
    steps: [leaf],
  };
}

/** workout_doc.steps → 我方 PlanBlock[]。 */
export function mapIntervalsIcuWorkoutDocToPlanBlocks(
  doc: IntervalsIcuWorkoutDoc,
): PlanBlock[] {
  const steps = Array.isArray(doc.steps) ? doc.steps : [];
  const blocks: PlanBlock[] = [];
  for (const step of steps) {
    const mapped = mapDocStepToBlock(step);
    if (mapped) blocks.push(mapped);
  }
  return blocks;
}

/** 日历事件 → 可导入的计划课草稿；缺日期/doc/blocks 则 null。 */
export function parseIntervalsIcuCalendarEvent(
  event: IntervalsIcuEvent,
): ParsedIntervalsCalendarWorkout | null {
  const scheduledDate = eventDate(event);
  const doc = event.workout_doc;
  if (!scheduledDate || !doc || typeof doc !== 'object') return null;

  const blocks = mapIntervalsIcuWorkoutDocToPlanBlocks(
    doc as IntervalsIcuWorkoutDoc,
  );
  if (blocks.length === 0) return null;

  return {
    scheduledDate,
    sportType: mapIntervalsSportType(event.type),
    name: cleanString(event.name),
    notes: cleanString(event.description),
    blocks,
  };
}
