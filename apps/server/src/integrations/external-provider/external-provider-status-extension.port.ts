import type { ThirdPartyProviderId } from '@shared/third-party-integration';

export const EXTERNAL_PROVIDER_STATUS_EXTENSION = Symbol(
  'EXTERNAL_PROVIDER_STATUS_EXTENSION',
);

export type ExternalProviderConnectionOverride = {
  connected?: boolean;
  externalAccountId?: string | null;
};

export interface ExternalProviderStatusExtension {
  loadConnectionOverrides(
    userId: string,
    providers: readonly ThirdPartyProviderId[],
  ): Promise<ReadonlyMap<string, ExternalProviderConnectionOverride>>;
  isProviderEnabled(provider: ThirdPartyProviderId): boolean | undefined;
  operationRequiresConnection(args: {
    provider: ThirdPartyProviderId;
    group: string;
    direction: 'import' | 'export';
  }): boolean | undefined;
}
