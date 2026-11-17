export type CoachFactScope = { topic: string; revision: string };
export const COACH_FACT_SCOPE_VALIDATOR = Symbol('COACH_FACT_SCOPE_VALIDATOR');
export interface CoachFactScopeValidator {
  current(userId: string): Promise<CoachFactScope[]>;
}
