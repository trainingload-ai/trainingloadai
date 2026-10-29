import {
  decryptSelfHostAiApiKey,
  encryptSelfHostAiApiKey,
} from './self-host-ai-configuration.crypto';
import { describe, expect, it } from '@jest/globals';

describe('self-host AI credential encryption', () => {
  const secret = 'a'.repeat(64);

  it('round-trips without embedding the plaintext in the envelope', () => {
    const encrypted = encryptSelfHostAiApiKey('sk-private-value', secret);

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('sk-private-value');
    expect(decryptSelfHostAiApiKey(encrypted, secret)).toBe('sk-private-value');
  });

  it('rejects a different instance secret', () => {
    const encrypted = encryptSelfHostAiApiKey('sk-private-value', secret);

    expect(() => decryptSelfHostAiApiKey(encrypted, 'b'.repeat(64))).toThrow();
  });
});
