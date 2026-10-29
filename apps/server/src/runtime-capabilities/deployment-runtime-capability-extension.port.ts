import type { RuntimeCapabilitySnapshot } from './runtime-capability.types';

export type DeploymentRuntimeCapabilityExtension = (
  snapshot: RuntimeCapabilitySnapshot,
  env: NodeJS.ProcessEnv,
) => RuntimeCapabilitySnapshot;

let extension: DeploymentRuntimeCapabilityExtension = (snapshot) => snapshot;

export function registerDeploymentRuntimeCapabilityExtension(
  next: DeploymentRuntimeCapabilityExtension,
) {
  extension = next;
}

export function applyDeploymentRuntimeCapabilityExtension(
  snapshot: RuntimeCapabilitySnapshot,
  env: NodeJS.ProcessEnv,
) {
  return extension(snapshot, env);
}
