import { describe, expect, it } from '@jest/globals';
import { resolveAuthCookiePolicy } from './auth-cookie-policy';

describe('resolveAuthCookiePolicy', () => {
  it('keeps managed production cookies secure and shared across managed subdomains', () => {
    expect(
      resolveAuthCookiePolicy({
        production: true,
        selfHost: false,
        publicBaseUrl: 'https://api.trainingload.ai',
        managedDomainBase: 'trainingload',
      }),
    ).toEqual({
      useSecureCookies: true,
      crossSubDomainCookies: {
        enabled: true,
        domain: '.trainingload.ai',
      },
    });
  });

  it('uses host-only secure cookies for self-host HTTPS', () => {
    expect(
      resolveAuthCookiePolicy({
        production: true,
        selfHost: true,
        publicBaseUrl: 'https://training.example.com',
        managedDomainBase: 'ignored',
      }),
    ).toEqual({ useSecureCookies: true });
  });

  it('uses host-only cookies for a managed production build on loopback HTTP', () => {
    expect(
      resolveAuthCookiePolicy({
        production: true,
        selfHost: false,
        publicBaseUrl: 'http://localhost:3001',
        managedDomainBase: 'trainingload',
      }),
    ).toEqual({
      useSecureCookies: false,
      cookiePrefix: 'trainingload-cloud-3001',
    });
  });

  it('keeps loopback HTTPS cookies secure without assigning the managed domain', () => {
    expect(
      resolveAuthCookiePolicy({
        production: true,
        selfHost: false,
        publicBaseUrl: 'https://127.0.0.1:3001',
        managedDomainBase: 'trainingload',
      }),
    ).toEqual({
      useSecureCookies: true,
      cookiePrefix: 'trainingload-cloud-3001',
    });
  });

  it('isolates local Cloud and Self-host sessions even on the same hostname', () => {
    const cloud = resolveAuthCookiePolicy({
      production: false,
      selfHost: false,
      publicBaseUrl: 'http://localhost:3001',
      managedDomainBase: 'trainingload',
    });
    const selfHost = resolveAuthCookiePolicy({
      production: false,
      selfHost: true,
      publicBaseUrl: 'http://localhost:43211',
      managedDomainBase: 'trainingload',
    });

    expect(cloud.cookiePrefix).toBe('trainingload-cloud-3001');
    expect(selfHost.cookiePrefix).toBe('trainingload-self-host-43211');
    expect(cloud.cookiePrefix).not.toBe(selfHost.cookiePrefix);
  });

  it('allows host-only non-secure cookies for an explicit self-host HTTP origin', () => {
    expect(
      resolveAuthCookiePolicy({
        production: true,
        selfHost: true,
        publicBaseUrl: 'http://localhost',
        managedDomainBase: 'ignored',
      }),
    ).toEqual({
      useSecureCookies: false,
      cookiePrefix: 'trainingload-self-host-80',
    });
  });
});
