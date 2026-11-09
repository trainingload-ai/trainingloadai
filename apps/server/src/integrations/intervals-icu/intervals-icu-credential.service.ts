import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalProviderCredentialVault } from '@/integrations/external-provider/external-provider-credential-vault.service';
import { intervalsIcuMetadataOf } from './intervals-icu-metadata';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import type { CredentialVault } from '@/integrations/external-provider/credential-vault.port';

/** 用户连接 Intervals.icu 的鉴权方式。 */
export type IntervalsIcuAuthType = 'api_key' | 'oauth';

/**
 * 传给 {@link IntervalsIcuClient} 的凭证。
 * - 纯 `string`：旧版 API Key（Basic 鉴权）。
 * - 对象：显式鉴权类型 + 解密后的 token。
 */
export type IntervalsIcuApiCredential =
  | string
  | {
      authType: IntervalsIcuAuthType;
      token: string;
    };

/** 读鉴权类型 / 解密凭证时需要的最小 connection 形状。 */
export type IntervalsIcuCredentialConnection = {
  credentialCiphertext: string;
  metadata?: unknown;
};

/**
 * 从 connection metadata 读取鉴权模式。
 * 缺失/未知时默认 `api_key`，兼容旧数据。
 */
export function intervalsIcuAuthTypeFromConnection(
  connection: { metadata?: unknown } | null | undefined,
): IntervalsIcuAuthType {
  return intervalsIcuMetadataOf(connection).authType === 'oauth'
    ? 'oauth'
    : 'api_key';
}

@Injectable()
export class IntervalsIcuCredentialService
  extends ExternalProviderCredentialVault
  implements CredentialVault
{
  constructor(
    configService: ConfigService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {
    super(configService);
  }

  /**
   * 解密落库密文并包装成 HTTP client 可用的凭证
   *（OAuth → Bearer 对象；API Key → 纯字符串）。
   */
  resolveConnectionCredential(
    connection: IntervalsIcuCredentialConnection,
  ): IntervalsIcuApiCredential {
    const authType = intervalsIcuAuthTypeFromConnection(connection);
    this.capabilities?.require(
      authType === 'oauth' ? 'third-party-sync' : 'intervals-icu-api-key',
    );
    const token = this.decrypt(connection.credentialCiphertext);
    return authType === 'oauth' ? { authType, token } : token;
  }
}
