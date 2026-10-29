import { resolveRegistrationAttribution } from '../registration-attribution';
import { describe, expect, it } from '@jest/globals';

describe('registration attribution', () => {
  it('reads email attribution from registration headers', () => {
    const headers = new Headers({
      'X-Registration-Platform': 'web',
      'X-Acquisition-Source': 'organic',
    });

    expect(
      resolveRegistrationAttribution({
        path: '/sign-up/email',
        headers,
      }),
    ).toEqual({
      registrationPlatform: 'WEB',
      registrationMethod: 'EMAIL',
      acquisitionSource: 'ORGANIC',
    });
  });

  it('prefers validated social additional data', () => {
    expect(
      resolveRegistrationAttribution({
        path: '/sign-in/social',
        body: {
          provider: 'apple',
          additionalData: {
            registrationPlatform: 'ios',
            registrationMethod: 'apple',
            acquisitionSource: 'direct',
          },
        },
      }),
    ).toEqual({
      registrationPlatform: 'IOS',
      registrationMethod: 'EXTERNAL',
      acquisitionSource: 'DIRECT',
    });
  });

  it('carries attribution through the encrypted OAuth state', () => {
    expect(
      resolveRegistrationAttribution(
        {
          path: '/callback/google',
        },
        {
          registrationPlatform: 'web',
          registrationMethod: 'google',
          acquisitionSource: 'organic',
          callbackURL: 'https://app.example.test/auth/complete',
          codeVerifier: 'not-attribution-data',
        },
      ),
    ).toEqual({
      registrationPlatform: 'WEB',
      registrationMethod: 'EXTERNAL',
      acquisitionSource: 'ORGANIC',
    });
  });

  it('stores provider-specific methods as the neutral external method', () => {
    expect(
      resolveRegistrationAttribution({
        path: '/sign-in/social',
        body: {
          provider: 'not-a-provider',
          additionalData: {
            registrationPlatform: 'desktop',
            acquisitionSource: 'injected',
          },
        },
      }),
    ).toEqual({
      registrationPlatform: 'UNKNOWN',
      registrationMethod: 'EXTERNAL',
      acquisitionSource: 'UNKNOWN',
    });
  });
});
