import { UnprocessableEntityException } from '@nestjs/common';

const PLAN_SCHEDULE_INVALID = 'PLAN_SCHEDULE_INVALID';

export function planScheduleInvalid(issues: readonly unknown[], message?: string) {
  return new UnprocessableEntityException({
    code: PLAN_SCHEDULE_INVALID,
    ...(message ? { message } : {}),
    data: { issues },
    // Older internal consumers can still inspect the exception directly.
    issues,
  });
}

export function readPlanScheduleIssues(response: unknown): unknown[] | undefined {
  if (typeof response !== 'object' || response === null) return;
  const body = response as { code?: unknown; data?: unknown; issues?: unknown };
  if (body.code !== PLAN_SCHEDULE_INVALID) return;
  const data = body.data as { issues?: unknown } | undefined;
  if (Array.isArray(data?.issues)) return data.issues;
  if (Array.isArray(body.issues)) return body.issues;
}
