export type DeploymentOAuthMetadataHandlers = {
  authorizationServer: (request: Request) => Promise<Response>;
  openIdConfiguration: (request: Request) => Promise<Response>;
};

export type DeploymentOAuthAuth = {
  api: {
    getOAuthServerConfig: (...args: any[]) => any;
    getOpenIdConfig: (...args: any[]) => any;
  };
};

export type DeploymentOAuthMetadataFactory = (
  auth: DeploymentOAuthAuth,
) => DeploymentOAuthMetadataHandlers;

let metadataFactory: DeploymentOAuthMetadataFactory | null = null;

/** Managed composition registers OAuth server metadata without Core importing its SDK. */
export function registerDeploymentOAuthMetadataFactory(
  factory: DeploymentOAuthMetadataFactory,
): void {
  if (metadataFactory) {
    throw new Error('OAuth metadata factory is already registered');
  }
  metadataFactory = factory;
}

export function getDeploymentOAuthMetadataHandlers(
  auth: DeploymentOAuthAuth,
): DeploymentOAuthMetadataHandlers {
  if (!metadataFactory) {
    throw new Error('OAuth metadata is not available in this deployment');
  }
  return metadataFactory(auth);
}
