import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';
import { requireExternalProviderCredentialSecret } from './external-provider-credential-secret';
import type { CredentialVault } from './credential-vault.port';

/** Shared v1 envelope; deliberately compatible with existing Intervals credentials. */
@Injectable()
export class ExternalProviderCredentialVault implements CredentialVault {
  constructor(private readonly config: ConfigService) {}
  private secret() {
    return requireExternalProviderCredentialSecret(this.config);
  }
  private key() {
    return createHash('sha256').update(this.secret()).digest();
  }
  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      bytes.toString('base64url'),
    ].join(':');
  }
  decrypt(value: string) {
    const [v, iv, tag, bytes, extra] = value.split(':');
    if (v !== 'v1' || !iv || !tag || !bytes || extra)
      throw new Error('Unsupported credential ciphertext');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(bytes, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
  last4(value: string) {
    return value.trim().slice(-4);
  }
  fingerprint(value: string) {
    return createHmac('sha256', this.secret())
      .update(value.trim())
      .digest('hex');
  }
}
