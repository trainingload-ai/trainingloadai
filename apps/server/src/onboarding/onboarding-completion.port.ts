export const ONBOARDING_COMPLETION = Symbol('ONBOARDING_COMPLETION');

export type OnboardingCompletionResult = Record<string, unknown>;

/** Deployment extension invoked after Core validates onboarding completion. */
export interface OnboardingCompletion {
  complete(userId: string): Promise<OnboardingCompletionResult>;
}
