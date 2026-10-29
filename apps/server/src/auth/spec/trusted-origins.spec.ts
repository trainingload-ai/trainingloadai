import { describe, expect, it } from '@jest/globals';
import { buildTrustedOrigins } from '../trusted-origins';

describe('trusted auth origins', () => {
  it('accepts equivalent loopback names on supported development ports', () => {
    const origins = buildTrustedOrigins();

    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      expect(origins).toContain(`http://${hostname}:3002`);
    }
  });

  it('keeps explicit deployment origins and removes duplicates', () => {
    const origins = buildTrustedOrigins(
      'https://app.example.com, https://api.example.com, https://app.example.com',
    );

    expect(origins).toContain('https://app.example.com');
    expect(origins).toContain('https://api.example.com');
    expect(
      origins.filter((origin) => origin === 'https://app.example.com'),
    ).toHaveLength(1);
  });

  it('merges origins declared by the active deployment composition', () => {
    const origins = buildTrustedOrigins('https://app.example.com', [
      'https://identity.example.com',
      'https://identity.example.com',
    ]);

    expect(origins).toContain('https://identity.example.com');
    expect(
      origins.filter((origin) => origin === 'https://identity.example.com'),
    ).toHaveLength(1);
  });
});
