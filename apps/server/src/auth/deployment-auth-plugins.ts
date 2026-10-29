import type { BetterAuthPlugin } from 'better-auth';

export type DeploymentAuthPluginContext = {
  baseUrl: string;
  appBaseUrl: string;
  authIssuer: string;
  oauthResourceUrls: string[];
};

export type DeploymentAuthPluginFactory = (
  context: DeploymentAuthPluginContext,
) => BetterAuthPlugin | BetterAuthPlugin[];

export type DeploymentSocialProviderFactory = (
  context: DeploymentAuthPluginContext,
) => Record<string, unknown>;

export type AuthOtpEmailType =
  | 'sign-in'
  | 'email-verification'
  | 'forget-password'
  | 'change-email';

export type DeploymentAuthMailDelivery = {
  sendOtp(args: {
    email: string;
    otp: string;
    type: AuthOtpEmailType;
    headers?: Headers;
    lang?: string;
  }): Promise<void>;
  sendPasswordReset(args: {
    email: string;
    url: string;
    headers?: Headers;
  }): Promise<void>;
};

export type DeploymentAuthMailDeliveryFactory = (
  context: DeploymentAuthPluginContext,
) => DeploymentAuthMailDelivery;

const deploymentAuthPlugins = new Map<string, DeploymentAuthPluginFactory>();
const deploymentSocialProviders = new Map<
  string,
  DeploymentSocialProviderFactory
>();
let deploymentAuthMailDelivery:
  | {
      id: string;
      factory: DeploymentAuthMailDeliveryFactory;
    }
  | undefined;
const deploymentLoginAccountProviderIds = new Set(['credential']);
const deploymentSocialLoginAccountProviderIds = new Set<string>();
const deploymentCapabilityGuardAccountProviderIds = new Set<string>();

/**
 * Registers an authentication plugin owned by a deployment composition root.
 * Core authentication stays provider-neutral; Self-host never imports Managed
 * plugin implementations or their runtime dependencies.
 */
export function registerDeploymentAuthPlugin(
  id: string,
  factory: DeploymentAuthPluginFactory,
): void {
  if (deploymentAuthPlugins.has(id)) {
    throw new Error(`Authentication plugin already registered: ${id}`);
  }
  deploymentAuthPlugins.set(id, factory);
}

export function getDeploymentAuthPlugins(
  context: DeploymentAuthPluginContext,
): BetterAuthPlugin[] {
  return [...deploymentAuthPlugins.values()].flatMap((factory) =>
    factory(context),
  );
}

export function registerDeploymentSocialProviders(
  id: string,
  factory: DeploymentSocialProviderFactory,
): void {
  if (deploymentSocialProviders.has(id)) {
    throw new Error(`Social auth providers already registered: ${id}`);
  }
  deploymentSocialProviders.set(id, factory);
}

export function getDeploymentSocialProviders(
  context: DeploymentAuthPluginContext,
): Record<string, unknown> {
  return Object.assign(
    {},
    ...[...deploymentSocialProviders.values()].map((factory) =>
      factory(context),
    ),
  );
}

/**
 * Registers the deployment-owned mail transport used by authentication.
 * Self-host intentionally leaves this unregistered, so Core never creates an
 * SMTP client or performs an implicit network request.
 */
export function registerDeploymentAuthMailDelivery(
  id: string,
  factory: DeploymentAuthMailDeliveryFactory,
): void {
  if (deploymentAuthMailDelivery) {
    throw new Error(
      `Authentication mail delivery already registered: ${deploymentAuthMailDelivery.id}`,
    );
  }
  deploymentAuthMailDelivery = { id, factory };
}

export function getDeploymentAuthMailDelivery(
  context: DeploymentAuthPluginContext,
): DeploymentAuthMailDelivery | null {
  return deploymentAuthMailDelivery?.factory(context) ?? null;
}

export function registerDeploymentAccountProviderPolicy(
  id: string,
  policy: {
    loginProviderIds?: readonly string[];
    socialLoginProviderIds?: readonly string[];
    capabilityGuardProviderIds?: readonly string[];
  },
) {
  if (!id.trim()) throw new Error('Account provider policy id is required');
  for (const provider of policy.loginProviderIds ?? []) {
    deploymentLoginAccountProviderIds.add(provider);
  }
  for (const provider of policy.socialLoginProviderIds ?? []) {
    deploymentSocialLoginAccountProviderIds.add(provider);
  }
  for (const provider of policy.capabilityGuardProviderIds ?? []) {
    deploymentCapabilityGuardAccountProviderIds.add(provider);
  }
}

export function getDeploymentAccountProviderPolicy() {
  return {
    loginProviderIds: new Set(deploymentLoginAccountProviderIds),
    socialLoginProviderIds: new Set(deploymentSocialLoginAccountProviderIds),
    capabilityGuardProviderIds: new Set(
      deploymentCapabilityGuardAccountProviderIds,
    ),
  };
}
