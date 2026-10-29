export type ThrottlingRequest = Record<string, unknown> & {
  originalUrl?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, unknown>;
  session?: { user?: { id?: unknown } };
  user?: { id?: unknown };
  auth?: { user?: { id?: unknown } };
};

export type DeploymentThrottlingPolicy = {
  matches(url: string): boolean;
  tracker?(request: ThrottlingRequest, url: string): string | null;
};

const policies: DeploymentThrottlingPolicy[] = [];

export function registerDeploymentThrottlingPolicy(
  policy: DeploymentThrottlingPolicy,
) {
  policies.push(policy);
}

export function deploymentThrottlingPolicy(url: string) {
  return policies.find((policy) => policy.matches(url));
}
