import { createHash } from 'crypto';
import type { SportType } from '@prisma/client';
import type { PlanBlock } from '@/api/workout/workout.service';

/** JSON round-trip，去掉 undefined，保证 checksum 输入可序列化。 */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

/** 对象键排序后的稳定序列化，用于内容指纹。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

/** 对任意值做稳定 SHA-256，用于计划课映射冲突检测。 */
export function workoutChecksum(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** 规范化 PlanBlock 树后再参与 checksum。 */
export function normalizeWorkoutBlocks(blocks: PlanBlock[]) {
  return jsonSafe(blocks);
}

/** 仅内容指纹（运动类型 + blocks），用于计划内自动合并匹配。 */
export function contentChecksum(args: {
  sportType: SportType;
  subSportType?: string | null;
  blocks: PlanBlock[];
}) {
  return workoutChecksum({
    sportType: args.sportType,
    subSportType: args.subSportType ?? null,
    blocks: normalizeWorkoutBlocks(args.blocks),
  });
}

/** 同步指纹（含日期/名称/备注），用于双向 sync 冲突检测。 */
export function syncChecksum(args: {
  scheduledDate: string;
  sportType: SportType;
  subSportType?: string | null;
  name: string | null;
  notes: string | null;
  blocks: PlanBlock[];
}) {
  return workoutChecksum({
    scheduledDate: args.scheduledDate,
    sportType: args.sportType,
    subSportType: args.subSportType ?? null,
    name: args.name,
    notes: args.notes,
    blocks: normalizeWorkoutBlocks(args.blocks),
  });
}
