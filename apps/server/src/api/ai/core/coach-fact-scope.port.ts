export type CoachFactScope = {
  topic: string;
  revision: string;
  timezone?: string;
  excludeMemorySourceMessageId?: string;
};
export const COACH_FACT_SCOPE_VALIDATOR = Symbol('COACH_FACT_SCOPE_VALIDATOR');
export interface CoachFactScopeValidator {
  current(
    userId: string,
    timezone?: string,
    excludeMemorySourceMessageId?: string,
  ): Promise<CoachFactScope[]>;
}

export function validCoachTimezone(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format();
    return value.trim();
  } catch {
    return undefined;
  }
}
