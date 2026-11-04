import type { Prisma } from '@prisma/client';
import type {
  CanonicalStrengthExerciseLabel,
  CanonicalStrengthSet,
} from './canonical-activity.types';

type ProjectedStrengthSet = {
  sourceSequenceIndex: number;
  completedReps: number | null;
  completedDurationSeconds: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  restAfterSeconds: number | null;
  loadType: 'OPEN' | 'ABSOLUTE';
  loadValue: number | null;
  loadUnit: 'KG' | null;
};

export type ProjectedStrengthExercise = {
  exerciseCode: string | null;
  name: string;
  notes: string | null;
  sets: ProjectedStrengthSet[];
};

const FIT_EXERCISE_CODES: Record<string, string> = {
  barbellDeadlift: 'deadlift',
  benchPress: 'benchPress',
  deadlift: 'deadlift',
  hipRaise: 'hipThrust',
  barbellHipThrustOnFloor: 'hipThrust',
  lunge: 'lunge',
  shoulderPress: 'overheadPress',
  squat: 'squat',
};

function finiteNonNegative(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function humanizeIdentifier(value: string) {
  const words = value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? `${words[0]?.toUpperCase()}${words.slice(1)}` : '';
}

function exerciseLabels(labels: CanonicalStrengthExerciseLabel[]) {
  const known = labels.filter(
    (label) => label.category.trim().toLowerCase() !== 'unknown',
  );
  if (known.length === 0) return ['unrecognizedExercise'];
  const selected = known;
  const identifiers = Array.from(
    new Set(
      selected
        .map((label) => label.name?.trim() || label.category.trim())
        .filter(Boolean),
    ),
  );
  return identifiers.length > 0 ? identifiers : ['unrecognizedExercise'];
}

function restAfter(
  ordered: CanonicalStrengthSet[],
  activeIndex: number,
): number | null {
  let seconds = 0;
  let found = false;
  for (let index = activeIndex + 1; index < ordered.length; index += 1) {
    const next = ordered[index];
    if (!next || next.setType === 'ACTIVE') break;
    if (next.setType !== 'REST') continue;
    const duration = finiteNonNegative(next.durationSeconds);
    if (duration === undefined) continue;
    seconds += duration;
    found = true;
  }
  return found ? Math.round(seconds) : null;
}

/**
 * Projects ordered FIT strength phases into the existing exercise/set model.
 * The canonical snapshot remains the lossless source of active/rest phases;
 * this projection groups equal device labels for normal product display.
 */
export function projectCanonicalStrengthExercises(
  phases: CanonicalStrengthSet[],
): ProjectedStrengthExercise[] {
  const ordered = [...phases].sort(
    (left, right) => left.sequenceIndex - right.sequenceIndex,
  );
  const groups = new Map<string, ProjectedStrengthExercise>();

  ordered.forEach((phase, phaseIndex) => {
    if (phase.setType !== 'ACTIVE') return;
    const identifiers = exerciseLabels(phase.exercises);
    const onlyUnknown = identifiers[0] === 'unrecognizedExercise';
    const groupKey = onlyUnknown
      ? `unknown:${phase.sequenceIndex}`
      : identifiers.join('|');
    const exactCode =
      identifiers.length === 1
        ? FIT_EXERCISE_CODES[identifiers[0]!]
        : undefined;
    const name = onlyUnknown
      ? 'Unrecognized exercise'
      : identifiers.map(humanizeIdentifier).join(' / ');
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        exerciseCode: exactCode ?? null,
        name,
        notes:
          identifiers.length > 1
            ? 'Multiple exercise labels were supplied by the FIT device.'
            : null,
        sets: [],
      };
      groups.set(groupKey, group);
    }

    const weightKg = finiteNonNegative(phase.weightKg);
    const startedAt = parseDate(phase.startTime ?? phase.timestamp);
    const durationSeconds = finiteNonNegative(phase.durationSeconds);
    group.sets.push({
      sourceSequenceIndex: phase.sequenceIndex,
      completedReps:
        finiteNonNegative(phase.repetitions) === undefined
          ? null
          : Math.round(phase.repetitions!),
      completedDurationSeconds:
        durationSeconds === undefined ? null : Math.round(durationSeconds),
      startedAt,
      completedAt:
        startedAt && durationSeconds !== undefined
          ? new Date(startedAt.getTime() + durationSeconds * 1000)
          : startedAt,
      restAfterSeconds: restAfter(ordered, phaseIndex),
      loadType: weightKg !== undefined && weightKg > 0 ? 'ABSOLUTE' : 'OPEN',
      loadValue: weightKg !== undefined && weightKg > 0 ? weightKg : null,
      loadUnit: weightKg !== undefined && weightKg > 0 ? 'KG' : null,
    });
  });

  return [...groups.values()];
}

/** Replaces only FIT-owned strength rows inside the caller's transaction. */
export async function replaceCanonicalStrengthRows(
  tx: Prisma.TransactionClient,
  activityId: number,
  phases: CanonicalStrengthSet[],
) {
  await tx.activityStrengthExercise.deleteMany({
    where: {
      activityId,
      sets: { some: { source: 'FIT' }, every: { source: 'FIT' } },
    },
  });
  const latest = await tx.activityStrengthExercise.findFirst({
    where: { activityId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });
  const baseOrderIndex = Number(latest?.orderIndex ?? -1) + 1;
  const exercises = projectCanonicalStrengthExercises(phases);

  for (const [exerciseOffset, exercise] of exercises.entries()) {
    const created = await tx.activityStrengthExercise.create({
      data: {
        activityId,
        orderIndex: baseOrderIndex + exerciseOffset,
        exerciseCode: exercise.exerciseCode,
        name: exercise.name,
        equipmentCode: null,
        notes: exercise.notes,
      },
    });
    if (exercise.sets.length === 0) continue;
    await tx.activityStrengthSet.createMany({
      data: exercise.sets.map((set, setIndex) => ({
        exerciseId: created.id,
        plannedSetGroupId: null,
        setIndex,
        sourceSequenceIndex: set.sourceSequenceIndex,
        setType: 'WORK',
        completedReps: set.completedReps,
        completedDurationSeconds: set.completedDurationSeconds,
        startedAt: set.startedAt,
        restAfterSeconds: set.restAfterSeconds,
        loadType: set.loadType,
        loadValue: set.loadValue,
        loadUnit: set.loadUnit,
        bodyweightOffsetDirection: null,
        actualRpe: null,
        actualRir: null,
        completedAt: set.completedAt,
        source: 'FIT',
      })),
    });
  }
}
