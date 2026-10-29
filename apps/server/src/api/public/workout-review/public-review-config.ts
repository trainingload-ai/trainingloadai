export function isPublicReviewEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PUBLIC_AI_REVIEW_ENABLED?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return env.NODE_ENV !== 'production';
}

export function readPublicReviewSecret(
  key: 'PUBLIC_AI_REVIEW_IDENTITY_SECRET' | 'PUBLIC_AI_REVIEW_ADMISSION_SECRET',
  localFallback: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env[key]?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === 'production' && isPublicReviewEnabled(env)) {
    throw new Error(`${key} is required when public AI review is enabled`);
  }
  return localFallback;
}
