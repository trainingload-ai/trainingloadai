import type {
  ThirdPartyCapabilities,
  ThirdPartyProviderId,
} from '@shared/third-party-integration';

export const EXTERNAL_PROVIDER_CAPABILITY_RESOLVER = Symbol(
  'EXTERNAL_PROVIDER_CAPABILITY_RESOLVER',
);

/**
 * 托管部署可用此端口按远端授权范围收窄产品能力；核心与自托管默认使用产品能力矩阵。
 */
export interface ExternalIntegrationPort {
  resolve(args: {
    provider: ThirdPartyProviderId;
    connection: { metadata?: unknown } | null;
    productCapabilities: ThirdPartyCapabilities;
  }): ThirdPartyCapabilities;
}

export interface ExternalProviderCapabilityResolver extends ExternalIntegrationPort {}
