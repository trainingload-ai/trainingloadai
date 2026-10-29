import { describe, expect, it } from '@jest/globals';
import { sanitizeExternalProviderReturnUrl } from '../external-provider-return-url';

describe('sanitizeExternalProviderReturnUrl', () => {
  const appUrl = 'https://app.trainingload.ai';

  it('accepts same-origin web and app-scheme callbacks', () => {
    expect(sanitizeExternalProviderReturnUrl('/zh/account', appUrl)).toBe(
      'https://app.trainingload.ai/zh/account',
    );
    expect(
      sanitizeExternalProviderReturnUrl(
        'trainingloadmobileapp://account/connections',
        appUrl,
      ),
    ).toBe('trainingloadmobileapp://account/connections');
  });

  it('accepts configured mobile callback protocols', () => {
    expect(
      sanitizeExternalProviderReturnUrl('trainingloaddev://oauth', appUrl, {
        OAUTH_MOBILE_REDIRECT_URIS:
          'trainingloaddev://auth/callback,trainingloadbeta://auth/callback',
      }),
    ).toBe('trainingloaddev://oauth');
  });

  it('rejects external web origins and unknown protocols', () => {
    expect(
      sanitizeExternalProviderReturnUrl(
        'https://evil.example/callback',
        appUrl,
      ),
    ).toBe('https://app.trainingload.ai/account');
    expect(
      sanitizeExternalProviderReturnUrl('unknownapp://callback', appUrl),
    ).toBe('https://app.trainingload.ai/account');
  });
});
