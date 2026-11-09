import {
  PersonalProviderError,
  record,
  requireId,
} from '../personal/personal-errors';

export function corosData(value: unknown): Record<string, any> {
  const root = record(value);
  if (root.success === false || Number(root.failedCount) > 0)
    throw new PersonalProviderError('PROVIDER_RESULT_UNKNOWN');
  return root.data && typeof root.data === 'object' && !Array.isArray(root.data)
    ? corosData(root.data)
    : root;
}

/** Exact requested fields, including ordered steps/targets; never coerce units or numbers. */
export function containsCorosContent(
  actual: unknown,
  expected: unknown,
  depth = 0,
): boolean {
  if (depth > 32 || expected === undefined) return false;
  if (expected === null || typeof expected !== 'object')
    return Object.is(actual, expected);
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((v, i) => containsCorosContent(actual[i], v, depth + 1))
    );
  const wanted = Object.entries(record(expected));
  return (
    wanted.length > 0 &&
    actual != null &&
    typeof actual === 'object' &&
    !Array.isArray(actual) &&
    wanted.every(
      ([k, v]) =>
        Object.prototype.hasOwnProperty.call(actual, k) &&
        containsCorosContent(record(actual)[k], v, depth + 1),
    )
  );
}

export function corosRemoteId(
  tool: string,
  args: Record<string, any>,
  response: unknown,
): string {
  const root = corosData(response);
  if (tool.includes('TrainingPlan'))
    return requireId(
      root.planId ??
        record(root.planInfo).planId ??
        root.id ??
        record(args.planInfo).planId,
    );
  if (['createScheduledWorkout', 'updateScheduledWorkout'].includes(tool))
    return requireId(root.idInPlan ?? args.idInPlan);
  return requireId(root.workoutId ?? root.id ?? args.workoutId);
}

export function verifyCorosWrite(
  tool: string,
  args: Record<string, any>,
  response: unknown,
) {
  const actual = corosData(response);
  if (tool === 'scheduleWorkout') {
    const matches = (
      value: unknown,
      parentDate?: string,
      depth = 0,
    ): boolean => {
      if (depth > 12) return false;
      if (Array.isArray(value))
        return value.some((item) => matches(item, parentDate, depth + 1));
      const item = record(value),
        day =
          item.date === undefined
            ? parentDate
            : String(item.date).replace(/-/g, '');
      if (
        day === args.date &&
        String(item.workoutId ?? '') === String(args.workoutId)
      )
        return true;
      return Object.entries(item).some(
        ([key, child]) =>
          child &&
          typeof child === 'object' &&
          matches(child, /^\d{8}$/.test(key) ? key : day, depth + 1),
      );
    };
    if (!matches(actual))
      throw new PersonalProviderError('PROVIDER_READBACK_MISMATCH');
    return;
  }
  if (tool === 'uploadRouteFile') {
    if (actual.accepted !== true && actual.success !== true && !actual.routeId)
      throw new PersonalProviderError('PROVIDER_RESULT_UNKNOWN');
    return;
  }
  if (tool.includes('TrainingPlan')) {
    for (const key of ['planInfo', 'phaseInfo', 'courseList'])
      if (
        args[key] !== undefined &&
        !containsCorosContent(actual[key], args[key])
      )
        throw new PersonalProviderError('PROVIDER_READBACK_MISMATCH');
    return;
  }
  if (
    args.course === undefined ||
    !containsCorosContent(actual.course ?? actual, args.course)
  )
    throw new PersonalProviderError('PROVIDER_READBACK_MISMATCH');
  if (
    args.date !== undefined &&
    String(actual.date ?? '').replace(/-/g, '') !== args.date
  )
    throw new PersonalProviderError('PROVIDER_READBACK_MISMATCH');
}

/** A listing may be truncated. Only an exact, unique candidate can resolve an unknown create. */
export function corosMatchingObjects(
  value: unknown,
  expected: unknown,
): Record<string, any>[] {
  const candidates: Record<string, any>[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 12) return;
    if (Array.isArray(v)) {
      v.forEach((item) => visit(item, depth + 1));
      return;
    }
    const item = record(v);
    if (
      (item.workoutId || item.idInPlan || item.planId || item.id) &&
      containsCorosContent(item.course ?? item, expected)
    )
      candidates.push(item);
    else
      Object.values(item).forEach((child) => {
        if (child && typeof child === 'object') visit(child, depth + 1);
      });
  };
  visit(value, 0);
  return candidates;
}
