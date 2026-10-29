import type { Prisma } from '@prisma/client';
import type { StrengthLoadV1 } from '../../../../../../packages/shared/strength-workout-ir';

export type StrengthLoadColumnFields = Pick<
  Prisma.PlanWorkoutSetGroupUncheckedCreateInput,
  'loadType' | 'loadValue' | 'loadUnit' | 'bodyweightOffsetDirection'
>;

export type StrengthLoadColumnRow = {
  loadType: string | null;
  loadValue: unknown;
  loadUnit: unknown;
  bodyweightOffsetDirection: unknown;
};

/** 计划课缺省 OPEN；活动实测缺省 ABSOLUTE。 */
export type StrengthLoadFallback = 'OPEN' | 'ABSOLUTE';

export function strengthLoadToColumns(
  load: StrengthLoadV1,
): StrengthLoadColumnFields {
  if (load.kind === 'OPEN' || load.kind === 'BODYWEIGHT') {
    return {
      loadType: load.kind,
      loadValue: null,
      loadUnit: null,
      bodyweightOffsetDirection: null,
    };
  }
  if (load.kind === 'PERCENT_1RM') {
    return {
      loadType: load.kind,
      loadValue: load.value,
      loadUnit: 'PERCENT',
      bodyweightOffsetDirection: null,
    };
  }
  if (load.kind === 'ABSOLUTE') {
    return {
      loadType: load.kind,
      loadValue: load.value,
      loadUnit: load.unit,
      bodyweightOffsetDirection: null,
    };
  }
  return {
    loadType: load.kind,
    loadValue: load.value,
    loadUnit: load.unit,
    bodyweightOffsetDirection: load.direction,
  };
}

export function strengthLoadFromColumns(
  row: StrengthLoadColumnRow,
  fallback: StrengthLoadFallback = 'OPEN',
): StrengthLoadV1 {
  if (row.loadType === 'OPEN') return { kind: 'OPEN' };
  if (row.loadType === 'BODYWEIGHT') return { kind: 'BODYWEIGHT' };
  if (row.loadType === 'ABSOLUTE') {
    return {
      kind: 'ABSOLUTE',
      value: Number(row.loadValue),
      unit: row.loadUnit === 'LB' ? 'LB' : 'KG',
    };
  }
  if (row.loadType === 'PERCENT_1RM') {
    return { kind: 'PERCENT_1RM', value: Number(row.loadValue) };
  }
  if (row.loadType === 'BODYWEIGHT_OFFSET') {
    return {
      kind: 'BODYWEIGHT_OFFSET',
      value: Number(row.loadValue),
      unit: row.loadUnit === 'LB' ? 'LB' : 'KG',
      direction:
        row.bodyweightOffsetDirection === 'ASSISTED' ? 'ASSISTED' : 'ADDED',
    };
  }
  if (fallback === 'ABSOLUTE') {
    return {
      kind: 'ABSOLUTE',
      value: Number(row.loadValue),
      unit: row.loadUnit === 'LB' ? 'LB' : 'KG',
    };
  }
  return { kind: 'OPEN' };
}
