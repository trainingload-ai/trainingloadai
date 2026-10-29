export type DeploymentEdition = 'self-host' | 'cloud';

/** Edition is chosen by the entrypoint, never by loading optional code. */
export function assertDeploymentEdition(
  edition: DeploymentEdition,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const configured = env.DEPLOYMENT_MODE?.trim();
  if (edition === 'cloud' && configured !== 'cloud') {
    throw new Error('Cloud entrypoint requires DEPLOYMENT_MODE=cloud');
  }
  if (edition === 'self-host') {
    if (configured && configured !== 'self-host') {
      throw new Error('Self-host entrypoint requires DEPLOYMENT_MODE=self-host');
    }
    env.DEPLOYMENT_MODE = 'self-host';
    env.SELF_HOST_MODE ||= 'core-local';
  } else if (env.SELF_HOST_MODE?.trim()) {
    throw new Error('Cloud entrypoint cannot use SELF_HOST_MODE');
  }
}
