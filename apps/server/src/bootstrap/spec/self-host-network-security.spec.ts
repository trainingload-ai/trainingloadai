import { describe, expect, it } from '@jest/globals';
import {
  isPrivateOrLocalHostname,
  resolveTrustProxySetting,
  validateSelfHostNetworkSecurity,
} from '../self-host-network-security';

function selfHost(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    SELF_HOST_MODE: 'core-local',
    NEXT_PUBLIC_APP_URL: 'http://localhost',
    NEXT_PUBLIC_API_URL: 'http://localhost',
    TRUSTED_ORIGINS: 'http://localhost',
    SELF_HOST_HTTP_BIND: '127.0.0.1',
    SELF_HOST_GATEWAY_ADDRESS: 'http://:80',
    ...overrides,
  };
}

describe('self-host network security', () => {
  it('accepts the loopback HTTP quickstart', () => {
    expect(validateSelfHostNetworkSecurity(selfHost())).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('warns for LAN HTTP while allowing private and home-network names', () => {
    for (const host of ['192.168.1.8', 'training.local', 'app.home.arpa']) {
      const result = validateSelfHostNetworkSecurity(
        selfHost({
          NEXT_PUBLIC_APP_URL: `http://${host}`,
          NEXT_PUBLIC_API_URL: `http://${host}`,
          TRUSTED_ORIGINS: `http://${host}`,
          SELF_HOST_HTTP_BIND: '0.0.0.0',
        }),
      );
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain(
        'SELF_HOST_INSECURE_LAN_HTTP: credentials and session cookies are unencrypted on the local network',
      );
    }
  });

  it('blocks public HTTP and origin mismatches by default', () => {
    const result = validateSelfHostNetworkSecurity(
      selfHost({
        NEXT_PUBLIC_APP_URL: 'http://training.example.com',
        NEXT_PUBLIC_API_URL: 'https://training.example.com',
        TRUSTED_ORIGINS: 'https://other.example.com',
        SELF_HOST_HTTP_BIND: '0.0.0.0',
      }),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must use the same origin'),
        'TRUSTED_ORIGINS must include NEXT_PUBLIC_APP_URL',
        expect.stringContaining('must use HTTPS'),
      ]),
    );
  });

  it('always warns when the public HTTP override is active', () => {
    const result = validateSelfHostNetworkSecurity(
      selfHost({
        NEXT_PUBLIC_APP_URL: 'http://training.example.com',
        NEXT_PUBLIC_API_URL: 'http://training.example.com',
        TRUSTED_ORIGINS: 'http://training.example.com',
        SELF_HOST_ALLOW_INSECURE_HTTP: 'true',
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      'SELF_HOST_INSECURE_PUBLIC_HTTP: explicit unsafe override is active; configure HTTPS before exposing this instance',
    );
  });

  it('requires a non-loopback public origin when the gateway is published', () => {
    const result = validateSelfHostNetworkSecurity(
      selfHost({ SELF_HOST_HTTP_BIND: '0.0.0.0' }),
    );
    expect(result.errors).toContain(
      'A non-loopback SELF_HOST_HTTP_BIND requires NEXT_PUBLIC_APP_URL to name the LAN or public host instead of localhost',
    );
  });

  it('accepts an HTTPS origin without a bundled gateway', () => {
    expect(validateSelfHostNetworkSecurity(selfHost({
      NEXT_PUBLIC_APP_URL: 'https://training.example.com',
      NEXT_PUBLIC_API_URL: 'https://training.example.com',
      TRUSTED_ORIGINS: 'https://training.example.com',
    })).errors).toEqual([]);
  });

  it('does not trust forwarded identity in the direct self-host topology', () => {
    expect(
      resolveTrustProxySetting({
        NODE_ENV: 'production',
        SELF_HOST_MODE: 'core-local',
      }),
    ).toBe(false);
    expect(resolveTrustProxySetting({ NODE_ENV: 'production' })).toBe(1);
    expect(resolveTrustProxySetting({ NODE_ENV: 'test' })).toBe(false);
  });

  it('does not classify public addresses as local', () => {
    expect(isPrivateOrLocalHostname('10.0.0.1')).toBe(true);
    expect(isPrivateOrLocalHostname('172.31.255.255')).toBe(true);
    expect(isPrivateOrLocalHostname('172.32.0.1')).toBe(false);
    expect(isPrivateOrLocalHostname('fd12:3456::1')).toBe(true);
    expect(isPrivateOrLocalHostname('fe80::1')).toBe(true);
    expect(isPrivateOrLocalHostname('2001:4860:4860::8888')).toBe(false);
    expect(isPrivateOrLocalHostname('8.8.8.8')).toBe(false);
    expect(isPrivateOrLocalHostname('example.com')).toBe(false);
  });
});
