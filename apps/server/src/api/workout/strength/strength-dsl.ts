import type {
  StrengthEffortV1,
  StrengthExerciseIrV1,
  StrengthLoadV1,
  StrengthPrescriptionV1,
  StrengthSetGroupIrV1,
  StrengthWorkoutIrV1,
} from '../../../../../../packages/shared/strength-workout-ir';
import type {
  StrengthWorkoutSummary,
  WorkoutLoadBucket,
} from '../../../../../../packages/shared/workout-summary';
import {
  WorkoutDefinitionValidationError,
  type WorkoutValidationIssue,
} from '../codecs/workout-codec';

const MAX_TEXT_LENGTH = 32 * 1024;
const MAX_EXERCISES = 50;
const MAX_GROUPS_PER_EXERCISE = 30;
const MAX_SETS_PER_GROUP = 100;
const MAX_DURATION_SECONDS = 12 * 60 * 60;
const MAX_REST_SECONDS = 2 * 60 * 60;

type SourceLine = { number: number; text: string; trimmed: string };

const issue = (
  code: string,
  message: string,
  line?: number,
  column = 1,
  path?: string,
): WorkoutValidationIssue => ({
  code,
  severity: 'ERROR',
  ...(line ? { line, column } : {}),
  ...(path ? { path } : {}),
  message,
});

const fail = (...issues: WorkoutValidationIssue[]): never => {
  throw new WorkoutDefinitionValidationError(issues);
};

export function parseStrengthWorkoutDsl(text: string): StrengthWorkoutIrV1 {
  if (!text?.trim())
    fail(issue('EMPTY_TEXT', 'Strength workout text cannot be empty'));
  if (text.length > MAX_TEXT_LENGTH) {
    fail(
      issue(
        'TEXT_TOO_LARGE',
        `Strength workout text exceeds ${MAX_TEXT_LENGTH} characters`,
      ),
    );
  }

  const lines: SourceLine[] = text.split(/\r?\n/).map((value, index) => ({
    number: index + 1,
    text: value,
    trimmed: value.trim(),
  }));
  const workout: StrengthWorkoutIrV1 = {
    kind: 'STRENGTH',
    version: 1,
    exercises: [],
  };
  let current: StrengthExerciseIrV1 | null = null;

  for (const line of lines) {
    if (!line.trimmed) continue;

    if (current) {
      if (line.trimmed === '}') {
        if (current.setGroups.length === 0) {
          fail(
            issue(
              'MISSING_SET_GROUP',
              'Exercise requires at least one set group',
              line.number,
            ),
          );
        }
        if (!current.setGroups.some((group) => group.setType === 'WORK')) {
          fail(
            issue(
              'MISSING_WORK_SET',
              'Exercise requires at least one work set',
              line.number,
            ),
          );
        }
        workout.exercises.push(current);
        if (workout.exercises.length > MAX_EXERCISES) {
          fail(
            issue(
              'TOO_MANY_EXERCISES',
              `At most ${MAX_EXERCISES} exercises are allowed`,
              line.number,
            ),
          );
        }
        current = null;
        continue;
      }
      if (/^exercise\b/i.test(line.trimmed)) {
        fail(
          issue(
            'UNCLOSED_EXERCISE',
            'Close the current exercise before starting another',
            line.number,
          ),
        );
      }
      current.setGroups.push(parseSetLine(line));
      if (current.setGroups.length > MAX_GROUPS_PER_EXERCISE) {
        fail(
          issue(
            'TOO_MANY_SET_GROUPS',
            `At most ${MAX_GROUPS_PER_EXERCISE} set groups are allowed per exercise`,
            line.number,
          ),
        );
      }
      continue;
    }

    const duration = /^duration\s+(\S+)$/i.exec(line.trimmed);
    if (duration) {
      if (workout.durationSeconds != null) {
        fail(
          issue(
            'DUPLICATE_DURATION',
            'Workout duration may only be declared once',
            line.number,
          ),
        );
      }
      workout.durationSeconds = parseDuration(
        duration[1],
        line,
        MAX_DURATION_SECONDS,
      );
      continue;
    }

    const sessionRpe = /^session\s+rpe\s+(\S+)$/i.exec(line.trimmed);
    if (sessionRpe) {
      if (workout.plannedSessionRpe != null) {
        fail(
          issue(
            'DUPLICATE_SESSION_RPE',
            'Session RPE may only be declared once',
            line.number,
          ),
        );
      }
      workout.plannedSessionRpe = parseBoundedNumber(
        sessionRpe[1],
        1,
        10,
        line,
        'INVALID_SESSION_RPE',
      );
      continue;
    }

    const exercise =
      /^exercise\s+"((?:\\.|[^"\\])*)"(?:\s+equipment\s+([a-z0-9_-]+))?\s*\{$/i.exec(
        line.trimmed,
      );
    if (exercise) {
      const name = unescapeQuoted(exercise[1]).trim();
      if (!name)
        fail(
          issue(
            'EMPTY_EXERCISE_NAME',
            'Exercise name cannot be empty',
            line.number,
          ),
        );
      current = {
        name,
        ...(exercise[2] ? { equipmentCode: exercise[2].toLowerCase() } : {}),
        setGroups: [],
      };
      continue;
    }

    if (line.trimmed === '}') {
      fail(issue('UNEXPECTED_BRACE', 'Unexpected closing brace', line.number));
    }
    fail(
      issue(
        'UNKNOWN_KEYWORD',
        `Unsupported strength DSL line: ${line.trimmed}`,
        line.number,
      ),
    );
  }

  if (current) {
    fail(
      issue(
        'UNCLOSED_EXERCISE',
        `Exercise "${current.name}" is missing a closing brace`,
        lines.length,
      ),
    );
  }
  if (workout.exercises.length === 0) {
    fail(
      issue(
        'MISSING_EXERCISE',
        'Strength workout requires at least one exercise',
      ),
    );
  }

  const validation = validateStrengthWorkout(workout);
  const errors = validation.filter((item) => item.severity === 'ERROR');
  if (errors.length) fail(...errors);
  return workout;
}

function parseSetLine(line: SourceLine): StrengthSetGroupIrV1 {
  const match = /^(warmup|work)\s+(\S+)(?:\s+(.*))?$/i.exec(line.trimmed);
  if (!match) {
    fail(
      issue(
        'INVALID_SET_LINE',
        'Expected warmup/work followed by a set prescription',
        line.number,
      ),
    );
  }
  const setType = match[1].toUpperCase() as 'WARMUP' | 'WORK';
  const { setCount, prescription } = parsePrescription(match[2], line);
  const tokens = tokenizeAttributes(match[3] ?? '', line);
  let load: StrengthLoadV1 = { kind: 'OPEN' };
  let effort: StrengthEffortV1 | undefined;
  let restSeconds: number | undefined;
  let loadSeen = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].toLowerCase();
    if (token === 'weight') {
      if (loadSeen)
        fail(
          issue(
            'DUPLICATE_LOAD',
            'Set group may only declare one load',
            line.number,
          ),
        );
      const value = tokens[++index];
      if (!value)
        fail(issue('MISSING_WEIGHT', 'weight requires a value', line.number));
      load = parseWeight(value, line);
      loadSeen = true;
      continue;
    }
    if (token === 'bodyweight') {
      if (loadSeen)
        fail(
          issue(
            'DUPLICATE_LOAD',
            'Set group may only declare one load',
            line.number,
          ),
        );
      const offset = tokens[index + 1];
      if (offset && /^[+-]/.test(offset)) {
        index += 1;
        load = parseBodyweightOffset(offset, line);
      } else {
        load = { kind: 'BODYWEIGHT' };
      }
      loadSeen = true;
      continue;
    }
    if (token === 'open') {
      if (loadSeen)
        fail(
          issue(
            'DUPLICATE_LOAD',
            'Set group may only declare one load',
            line.number,
          ),
        );
      load = { kind: 'OPEN' };
      loadSeen = true;
      continue;
    }
    if (token === 'rpe' || token === 'rir') {
      if (effort)
        fail(
          issue(
            'CONFLICTING_EFFORT',
            'Use either RPE or RIR, not both',
            line.number,
          ),
        );
      const value = tokens[++index];
      if (!value)
        fail(issue('MISSING_EFFORT', `${token} requires a value`, line.number));
      effort = {
        kind: token.toUpperCase() as 'RPE' | 'RIR',
        value: parseBoundedNumber(
          value,
          token === 'rpe' ? 1 : 0,
          10,
          line,
          `INVALID_${token.toUpperCase()}`,
        ),
      };
      continue;
    }
    if (token === 'rest') {
      if (restSeconds != null)
        fail(
          issue(
            'DUPLICATE_REST',
            'rest may only be declared once',
            line.number,
          ),
        );
      const value = tokens[++index];
      if (!value)
        fail(issue('MISSING_REST', 'rest requires a duration', line.number));
      restSeconds = parseDuration(value, line, MAX_REST_SECONDS);
      continue;
    }
    fail(
      issue(
        'UNSUPPORTED_FEATURE',
        `Unsupported set attribute: ${tokens[index]}`,
        line.number,
      ),
    );
  }

  return {
    setType,
    setCount,
    prescription,
    load,
    ...(effort ? { effort } : {}),
    ...(restSeconds != null ? { restSeconds } : {}),
  };
}

function parsePrescription(
  token: string,
  line: SourceLine,
): { setCount: number; prescription: StrengthPrescriptionV1 } {
  const timed = /^(\d+)x(\d+(?:\.\d+)?)(s|m|h)$/i.exec(token);
  if (timed) {
    const setCount = parsePositiveInt(timed[1], line, 'INVALID_SET_COUNT');
    const durationSeconds = parseDuration(
      `${timed[2]}${timed[3]}`,
      line,
      MAX_DURATION_SECONDS,
    );
    assertSetCount(setCount, line);
    return {
      setCount,
      prescription: { kind: 'TIME', durationSeconds },
    };
  }

  // AI-generated and imported workouts commonly spell a pure AMRAP group as
  // `3xAMRAP`. Accept it as a compatibility alias and canonicalize it to
  // `3x1+`; the IR requires a positive minimum-rep value for AMRAP sets.
  const pureAmrap = /^(\d+)xamrap$/i.exec(token);
  if (pureAmrap) {
    const setCount = parsePositiveInt(pureAmrap[1], line, 'INVALID_SET_COUNT');
    assertSetCount(setCount, line);
    return {
      setCount,
      prescription: {
        kind: 'REPS',
        repsMin: 1,
        repsMax: 1,
        amrap: true,
      },
    };
  }

  const reps = /^(\d+)x(\d+)(?:-(\d+))?(\+)?$/.exec(token);
  if (!reps) {
    fail(
      issue(
        'INVALID_PRESCRIPTION',
        `Invalid set prescription: ${token}`,
        line.number,
      ),
    );
  }
  const setCount = parsePositiveInt(reps[1], line, 'INVALID_SET_COUNT');
  const repsMin = parsePositiveInt(reps[2], line, 'INVALID_REPS');
  const repsMax = reps[3]
    ? parsePositiveInt(reps[3], line, 'INVALID_REPS')
    : repsMin;
  assertSetCount(setCount, line);
  if (repsMax < repsMin) {
    fail(
      issue(
        'INVALID_REPS_RANGE',
        'Maximum reps must be greater than or equal to minimum reps',
        line.number,
      ),
    );
  }
  return {
    setCount,
    prescription: {
      kind: 'REPS',
      repsMin,
      repsMax,
      amrap: Boolean(reps[4]),
    },
  };
}

function parseWeight(token: string, line: SourceLine): StrengthLoadV1 {
  const percent = /^(\d+(?:\.\d+)?)%1rm$/i.exec(token);
  if (percent) {
    return {
      kind: 'PERCENT_1RM',
      value: parseBoundedNumber(
        percent[1],
        0.01,
        100,
        line,
        'INVALID_PERCENT_1RM',
      ),
    };
  }
  const absolute = /^(\d+(?:\.\d+)?)(kg|lb)$/i.exec(token);
  if (!absolute)
    fail(issue('INVALID_WEIGHT', `Invalid weight: ${token}`, line.number));
  return {
    kind: 'ABSOLUTE',
    value: parseBoundedNumber(absolute[1], 0, 5000, line, 'INVALID_WEIGHT'),
    unit: absolute[2].toUpperCase() as 'KG' | 'LB',
  };
}

function parseBodyweightOffset(
  token: string,
  line: SourceLine,
): StrengthLoadV1 {
  const match = /^([+-])(\d+(?:\.\d+)?)(kg|lb)$/i.exec(token);
  if (!match)
    fail(
      issue(
        'INVALID_BODYWEIGHT_OFFSET',
        `Invalid bodyweight offset: ${token}`,
        line.number,
      ),
    );
  return {
    kind: 'BODYWEIGHT_OFFSET',
    value: parseBoundedNumber(
      match[2],
      0,
      5000,
      line,
      'INVALID_BODYWEIGHT_OFFSET',
    ),
    direction: match[1] === '+' ? 'ADDED' : 'ASSISTED',
    unit: match[3].toUpperCase() as 'KG' | 'LB',
  };
}

function tokenizeAttributes(value: string, line: SourceLine): string[] {
  if (!value.trim()) return [];
  if (/[{},]/.test(value)) {
    fail(
      issue(
        'UNSUPPORTED_FEATURE',
        'Nested blocks and comma-separated attributes are not supported',
        line.number,
      ),
    );
  }
  return value.trim().split(/\s+/);
}

function parseDuration(token: string, line: SourceLine, max: number): number {
  const match = /^(\d+(?:\.\d+)?)(s|m|h)$/i.exec(token);
  if (!match)
    fail(issue('INVALID_DURATION', `Invalid duration: ${token}`, line.number));
  const value = Number(match[1]);
  const multiplier =
    match[2].toLowerCase() === 'h'
      ? 3600
      : match[2].toLowerCase() === 'm'
        ? 60
        : 1;
  const seconds = value * multiplier;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > max) {
    fail(
      issue(
        'INVALID_DURATION',
        `Duration must be between 1 second and ${max} seconds`,
        line.number,
      ),
    );
  }
  return Math.round(seconds);
}

function parsePositiveInt(
  token: string,
  line: SourceLine,
  code: string,
): number {
  const value = Number(token);
  if (!Number.isInteger(value) || value <= 0) {
    fail(
      issue(
        code,
        `Expected a positive integer, received ${token}`,
        line.number,
      ),
    );
  }
  return value;
}

function assertSetCount(value: number, line: SourceLine) {
  if (value > MAX_SETS_PER_GROUP) {
    fail(
      issue(
        'TOO_MANY_SETS',
        `At most ${MAX_SETS_PER_GROUP} sets are allowed per group`,
        line.number,
      ),
    );
  }
}

function parseBoundedNumber(
  token: string,
  min: number,
  max: number,
  line: SourceLine,
  code: string,
): number {
  const value = Number(token);
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(issue(code, `Value must be between ${min} and ${max}`, line.number));
  }
  return value;
}

function unescapeQuoted(value: string): string {
  return value.replace(/\\(["\\])/g, '$1');
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function validateStrengthWorkout(
  workout: StrengthWorkoutIrV1,
): WorkoutValidationIssue[] {
  const issues: WorkoutValidationIssue[] = [];
  if (workout.kind !== 'STRENGTH' || workout.version !== 1) {
    issues.push(
      issue(
        'INVALID_STRUCTURE',
        'Expected a STRENGTH v1 structure',
        undefined,
        1,
        'kind',
      ),
    );
    return issues;
  }
  if (!Array.isArray(workout.exercises) || workout.exercises.length === 0) {
    issues.push(
      issue(
        'MISSING_EXERCISE',
        'Strength workout requires at least one exercise',
        undefined,
        1,
        'exercises',
      ),
    );
    return issues;
  }
  if (workout.exercises.length > MAX_EXERCISES) {
    issues.push(
      issue(
        'TOO_MANY_EXERCISES',
        `At most ${MAX_EXERCISES} exercises are allowed`,
        undefined,
        1,
        'exercises',
      ),
    );
  }
  workout.exercises.forEach((exercise, exerciseIndex) => {
    if (!exercise.name?.trim()) {
      issues.push(
        issue(
          'EMPTY_EXERCISE_NAME',
          'Exercise name cannot be empty',
          undefined,
          1,
          `exercises.${exerciseIndex}.name`,
        ),
      );
    }
    if (
      !Array.isArray(exercise.setGroups) ||
      !exercise.setGroups.some((group) => group.setType === 'WORK')
    ) {
      issues.push(
        issue(
          'MISSING_WORK_SET',
          'Exercise requires at least one work set',
          undefined,
          1,
          `exercises.${exerciseIndex}.setGroups`,
        ),
      );
    }
    exercise.setGroups?.forEach((group, groupIndex) => {
      const path = `exercises.${exerciseIndex}.setGroups.${groupIndex}`;
      if (group.setType !== 'WARMUP' && group.setType !== 'WORK') {
        issues.push(
          issue(
            'INVALID_SET_TYPE',
            'Set type must be WARMUP or WORK',
            undefined,
            1,
            `${path}.setType`,
          ),
        );
      }
      if (
        !Number.isInteger(group.setCount) ||
        group.setCount < 1 ||
        group.setCount > MAX_SETS_PER_GROUP
      ) {
        issues.push(
          issue(
            'INVALID_SET_COUNT',
            `Set count must be between 1 and ${MAX_SETS_PER_GROUP}`,
            undefined,
            1,
            `${path}.setCount`,
          ),
        );
      }
      if (group.prescription?.kind === 'REPS') {
        if (
          !Number.isInteger(group.prescription.repsMin) ||
          !Number.isInteger(group.prescription.repsMax) ||
          group.prescription.repsMin < 1 ||
          group.prescription.repsMax < group.prescription.repsMin
        ) {
          issues.push(
            issue(
              'INVALID_REPS_RANGE',
              'Reps must be positive integers with min <= max',
              undefined,
              1,
              `${path}.prescription`,
            ),
          );
        }
      } else if (group.prescription?.kind === 'TIME') {
        if (
          !Number.isInteger(group.prescription.durationSeconds) ||
          group.prescription.durationSeconds < 1 ||
          group.prescription.durationSeconds > MAX_DURATION_SECONDS
        ) {
          issues.push(
            issue(
              'INVALID_DURATION',
              'Timed set duration is outside the supported range',
              undefined,
              1,
              `${path}.prescription.durationSeconds`,
            ),
          );
        }
      } else {
        issues.push(
          issue(
            'INVALID_PRESCRIPTION',
            'Set group requires a REPS or TIME prescription',
            undefined,
            1,
            `${path}.prescription`,
          ),
        );
      }
      if (!isValidLoad(group.load)) {
        issues.push(
          issue(
            'INVALID_LOAD',
            'Set group load is invalid',
            undefined,
            1,
            `${path}.load`,
          ),
        );
      }
      if (
        group.restSeconds != null &&
        (!Number.isInteger(group.restSeconds) ||
          group.restSeconds < 1 ||
          group.restSeconds > MAX_REST_SECONDS)
      ) {
        issues.push(
          issue(
            'INVALID_REST',
            'Rest duration is outside the supported range',
            undefined,
            1,
            `${path}.restSeconds`,
          ),
        );
      }
      if (
        group.effort?.kind === 'RPE' &&
        (group.effort.value < 1 || group.effort.value > 10)
      ) {
        issues.push(
          issue(
            'INVALID_RPE',
            'RPE must be between 1 and 10',
            undefined,
            1,
            `${path}.effort`,
          ),
        );
      }
      if (
        group.effort?.kind === 'RIR' &&
        (group.effort.value < 0 || group.effort.value > 10)
      ) {
        issues.push(
          issue(
            'INVALID_RIR',
            'RIR must be between 0 and 10',
            undefined,
            1,
            `${path}.effort`,
          ),
        );
      }
    });
  });
  return issues;
}

function isValidLoad(load: StrengthLoadV1 | undefined): boolean {
  if (!load) return false;
  if (load.kind === 'OPEN' || load.kind === 'BODYWEIGHT') return true;
  if (load.kind === 'ABSOLUTE') {
    return (
      Number.isFinite(load.value) &&
      load.value >= 0 &&
      load.value <= 5000 &&
      (load.unit === 'KG' || load.unit === 'LB')
    );
  }
  if (load.kind === 'PERCENT_1RM') {
    return Number.isFinite(load.value) && load.value > 0 && load.value <= 100;
  }
  if (load.kind === 'BODYWEIGHT_OFFSET') {
    return (
      Number.isFinite(load.value) &&
      load.value >= 0 &&
      load.value <= 5000 &&
      (load.unit === 'KG' || load.unit === 'LB') &&
      (load.direction === 'ADDED' || load.direction === 'ASSISTED')
    );
  }
  return false;
}

export function stringifyStrengthWorkoutDsl(
  workout: StrengthWorkoutIrV1,
): string {
  const lines: string[] = [];
  if (workout.durationSeconds != null)
    lines.push(`duration ${formatDuration(workout.durationSeconds)}`);
  if (workout.plannedSessionRpe != null)
    lines.push(`session rpe ${formatNumber(workout.plannedSessionRpe)}`);
  if (lines.length) lines.push('');
  workout.exercises.forEach((exercise, exerciseIndex) => {
    const equipment = exercise.equipmentCode
      ? ` equipment ${exercise.equipmentCode.toLowerCase()}`
      : '';
    lines.push(`exercise "${escapeQuoted(exercise.name)}"${equipment} {`);
    for (const group of exercise.setGroups)
      lines.push(`  ${stringifySetGroup(group)}`);
    lines.push('}');
    if (exerciseIndex < workout.exercises.length - 1) lines.push('');
  });
  return lines.join('\n');
}

function stringifySetGroup(group: StrengthSetGroupIrV1): string {
  const tokens = [group.setType.toLowerCase(), stringifyPrescription(group)];
  const load = group.load;
  if (load.kind === 'ABSOLUTE')
    tokens.push(
      'weight',
      `${formatNumber(load.value)}${load.unit.toLowerCase()}`,
    );
  else if (load.kind === 'PERCENT_1RM')
    tokens.push('weight', `${formatNumber(load.value)}%1rm`);
  else if (load.kind === 'BODYWEIGHT') tokens.push('bodyweight');
  else if (load.kind === 'BODYWEIGHT_OFFSET') {
    tokens.push(
      'bodyweight',
      `${load.direction === 'ADDED' ? '+' : '-'}${formatNumber(load.value)}${load.unit.toLowerCase()}`,
    );
  } else tokens.push('open');
  if (group.effort)
    tokens.push(
      group.effort.kind.toLowerCase(),
      formatNumber(group.effort.value),
    );
  if (group.restSeconds != null)
    tokens.push('rest', formatDuration(group.restSeconds));
  return tokens.join(' ');
}

function stringifyPrescription(group: StrengthSetGroupIrV1): string {
  if (group.prescription.kind === 'TIME') {
    return `${group.setCount}x${formatDuration(group.prescription.durationSeconds)}`;
  }
  const range =
    group.prescription.repsMin === group.prescription.repsMax
      ? String(group.prescription.repsMin)
      : `${group.prescription.repsMin}-${group.prescription.repsMax}`;
  return `${group.setCount}x${range}${group.prescription.amrap ? '+' : ''}`;
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function formatNumber(value: number): string {
  return Number(value).toString();
}

export function summarizeStrengthWorkout(
  workout: StrengthWorkoutIrV1,
): StrengthWorkoutSummary {
  let warmupSetCount = 0;
  let workingSetCount = 0;
  let totalRepsMin = 0;
  let totalRepsMax = 0;
  let timedSetSeconds = 0;
  let volumeLoadKg = 0;
  let volumeLoadLb = 0;
  let hasReps = false;
  let hasKg = false;
  let hasLb = false;
  let hardByEffort = false;
  let lowerSets = 0;
  let upperSets = 0;
  let classifiedExercises = 0;

  for (const exercise of workout.exercises) {
    const region = classifyExercise(exercise.name);
    if (region !== 'UNKNOWN') classifiedExercises += 1;
    for (const group of exercise.setGroups) {
      if (group.setType === 'WARMUP') warmupSetCount += group.setCount;
      else {
        workingSetCount += group.setCount;
        if (region === 'LOWER') lowerSets += group.setCount;
        if (region === 'UPPER') upperSets += group.setCount;
      }
      if (group.prescription.kind === 'REPS') {
        if (group.setType === 'WORK') {
          hasReps = true;
          totalRepsMin += group.setCount * group.prescription.repsMin;
          totalRepsMax += group.setCount * group.prescription.repsMax;
        }
        if (group.setType === 'WORK' && group.load.kind === 'ABSOLUTE') {
          const amount =
            group.setCount * group.prescription.repsMin * group.load.value;
          if (group.load.unit === 'KG') {
            volumeLoadKg += amount;
            hasKg = true;
          } else {
            volumeLoadLb += amount;
            hasLb = true;
          }
        }
      } else if (group.setType === 'WORK') {
        timedSetSeconds += group.setCount * group.prescription.durationSeconds;
      }
      if (
        group.setType === 'WORK' &&
        ((group.effort?.kind === 'RPE' && group.effort.value >= 8.5) ||
          (group.effort?.kind === 'RIR' && group.effort.value <= 1))
      ) {
        hardByEffort = true;
      }
    }
  }

  const lowerBodyLoad = bucketForSets(lowerSets, classifiedExercises === 0);
  const upperBodyLoad = bucketForSets(upperSets, classifiedExercises === 0);
  const definitelyHard =
    hardByEffort ||
    lowerSets >= 8 ||
    (workout.plannedSessionRpe != null && workout.plannedSessionRpe >= 8);
  const hardSession = definitelyHard
    ? true
    : classifiedExercises === 0 && workout.plannedSessionRpe == null
      ? null
      : false;
  return {
    kind: 'STRENGTH',
    durationSeconds: workout.durationSeconds ?? null,
    durationSource: workout.durationSeconds != null ? 'EXPLICIT' : 'UNKNOWN',
    plannedSessionRpe: workout.plannedSessionRpe ?? null,
    exerciseCount: workout.exercises.length,
    warmupSetCount,
    workingSetCount,
    totalRepsMin: hasReps ? totalRepsMin : null,
    totalRepsMax: hasReps ? totalRepsMax : null,
    timedSetSeconds,
    volumeLoadKg: hasKg ? Math.round(volumeLoadKg * 100) / 100 : null,
    volumeLoadLb: hasLb ? Math.round(volumeLoadLb * 100) / 100 : null,
    loadConfidence:
      workout.durationSeconds != null && workout.plannedSessionRpe != null
        ? 'HIGH'
        : classifiedExercises > 0
          ? 'MEDIUM'
          : 'LOW',
    hardSession,
    lowerBodyLoad,
    upperBodyLoad,
  };
}

function bucketForSets(sets: number, unknown: boolean): WorkoutLoadBucket {
  if (unknown) return 'UNKNOWN';
  if (sets >= 8) return 'HIGH';
  if (sets >= 4) return 'MEDIUM';
  return 'LOW';
}

function classifyExercise(name: string): 'LOWER' | 'UPPER' | 'UNKNOWN' {
  const normalized = name.toLowerCase();
  if (
    /(squat|deadlift|lunge|leg press|step[- ]?up|hip thrust|calf|深蹲|硬拉|箭步|腿举|臀推|提踵)/i.test(
      normalized,
    )
  ) {
    return 'LOWER';
  }
  if (
    /(bench|press|row|pull[- ]?up|chin[- ]?up|pulldown|curl|triceps|fly|卧推|推举|划船|引体|下拉|弯举|臂屈伸)/i.test(
      normalized,
    )
  ) {
    return 'UPPER';
  }
  return 'UNKNOWN';
}
