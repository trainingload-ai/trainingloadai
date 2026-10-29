import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';
import { requireExternalProviderCredentialSecret } from '@/integrations/external-provider/external-provider-credential-secret';
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

/** 由共享凭证密钥派生的 AES-256-GCM 密钥材料。 */
function deriveKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

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
export class IntervalsIcuCredentialService implements CredentialVault {
  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  /** 解析第三方凭证专用加密密钥。 */
  private secret() {
    return requireExternalProviderCredentialSecret(this.configService);
  }

  /**
   * 将凭证字符串加密为 `v1:iv:tag:ciphertext`（各段 base64url）。
   * 用于落地存储 API Key 与 OAuth access token。
   */
  encrypt(plainText: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(this.secret()), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  /** 解密 {@link encrypt} 产出的 `v1:` 密文信封。 */
  decrypt(encoded: string) {
    const [version, ivRaw, tagRaw, ciphertextRaw] = encoded.split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
      throw new Error('Unsupported credential ciphertext');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(this.secret()),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** 末 4 位，供 UI 展示（切勿存储/展示完整密钥）。 */
  last4(value: string) {
    const trimmed = value.trim();
    return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
  }

  /** 稳定 HMAC 指纹，用于变更检测且不落盘明文。 */
  fingerprint(value: string) {
    return createHmac('sha256', this.secret())
      .update(value.trim())
      .digest('hex');
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
