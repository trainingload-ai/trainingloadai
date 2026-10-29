export type SignupPolicyErrorCode =
  | 'SIGNUP_DISABLED'
  | 'SELF_HOST_OWNER_REQUIRED';

type SelfHostInstanceReader = {
  selfHostInstance: {
    findUnique(args: {
      where: { id: number };
      select: { state: true };
    }): Promise<{ state: 'PENDING' | 'READY' } | null>;
  };
};

const SELF_HOST_INSTANCE_ID = 1;

function value(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim().toLowerCase() ?? '';
}

export function isSelfHostDeployment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return value(env, 'DEPLOYMENT_MODE') === 'self-host' || Boolean(value(env, 'SELF_HOST_MODE'));
}

/**
 * Managed deployments remain open unless explicitly disabled. Self-hosted
 * deployments have exactly one Owner and never permit public signup.
 */
export function isPublicSignupEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isSelfHostDeployment(env)) return false;
  const configured = value(env, 'DISABLE_SIGNUP');
  if (!configured) return !isSelfHostDeployment(env);
  return configured === 'false';
}

/**
 * Public registration can never claim the self-host Owner. The host-side
 * bootstrap must finish first; registrations opened afterwards create only
 * ordinary application users.
 */
export async function publicSignupBlockReason(
  database: SelfHostInstanceReader,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SignupPolicyErrorCode | null> {
  if (!isPublicSignupEnabled(env)) return 'SIGNUP_DISABLED';
  if (!isSelfHostDeployment(env)) return null;

  const instance = await database.selfHostInstance.findUnique({
    where: { id: SELF_HOST_INSTANCE_ID },
    select: { state: true },
  });
  return instance?.state === 'READY' ? null : 'SELF_HOST_OWNER_REQUIRED';
}
