import {
  EXPLORATION_UNITS,
  type ExplorationMeasure,
  type ExplorationPanel,
  type ExplorationQuery,
} from '@shared/training-exploration';

type Step = {
  id: string;
  parentId: string | null;
  stepType: string;
  durationType: string;
  durationValue: number | null;
  durationUnit: string | null;
};
/** A partial prescription is not a full planned duration/distance. Repeat counts multiply leaves. */
export function plannedStepTotal(
  steps: Step[],
  measure: 'DURATION_MIN' | 'DISTANCE_KM',
): number | null {
  if (!steps.length) return null;
  const children = new Map<string | null, Step[]>();
  steps.forEach((s) =>
    children.set(s.parentId, [...(children.get(s.parentId) ?? []), s]),
  );
  const visited = new Set<string>();
  const visit = (parent: string | null): number | null => {
    const nodes = children.get(parent);
    if (!nodes?.length) return null;
    let sum = 0;
    for (const s of nodes) {
      if (visited.has(s.id)) return null;
      visited.add(s.id);
      if (s.stepType === 'REPEAT') {
        const v = visit(s.id);
        if (
          v === null ||
          s.durationType !== 'REPEAT_COUNT' ||
          !Number.isInteger(s.durationValue) ||
          s.durationValue! <= 0
        )
          return null;
        sum += v * s.durationValue!;
      } else {
        const type = measure === 'DURATION_MIN' ? 'TIME' : 'DISTANCE';
        const unit = measure === 'DURATION_MIN' ? 'SECONDS' : 'METERS';
        if (
          s.durationType !== type ||
          s.durationUnit !== unit ||
          s.durationValue == null ||
          s.durationValue < 0
        )
          return null;
        sum += s.durationValue;
      }
    }
    return sum;
  };
  const sum = visit(null);
  return sum === null || visited.size !== steps.length
    ? null
    : sum / (measure === 'DURATION_MIN' ? 60 : 1000);
}
export type PlanExecutionRow = {
  id: string;
  name: string | null;
  date: string;
  planned: Partial<Record<ExplorationMeasure, number | null>>;
  actual: Partial<Record<ExplorationMeasure, number | null>>;
};
export function buildPlanExecutionPanels(
  rows: PlanExecutionRow[],
  q: ExplorationQuery,
  bucket: (date: string) => string,
): ExplorationPanel[] {
  const groups = new Map<string, PlanExecutionRow[]>();
  for (const r of rows) {
    const key = q.groupBy === 'WORKOUT' ? r.id : bucket(r.date);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const values = [...groups.values()];
  const categories = [...groups].map(([key, group]) =>
    q.groupBy === 'WORKOUT'
      ? `${group[0].date} · ${group[0].name ?? group[0].id}`
      : key,
  );
  return (q.measures ?? []).map((measure) => ({
    id: measure,
    measure,
    view: 'BAR',
    x: { kind: 'CATEGORY', categories },
    y: {
      kind: 'NUMBER',
      measure,
      unit: EXPLORATION_UNITS[measure],
      zeroBaseline: true,
    },
    series: (['planned', 'actual'] as const).map((role) => ({
      id: role,
      role: role === 'planned' ? 'PLANNED' : 'ACTUAL',
      points: values.map((group, x) => {
        const known = group.map((r) => r[role][measure]);
        return {
          x,
          y: known.every((v) => v != null && Number.isFinite(v))
            ? known.reduce<number>((sum, v) => sum + v!, 0)
            : null,
          coverage: known.filter((v) => v != null).length / known.length,
        };
      }),
    })),
  }));
}
