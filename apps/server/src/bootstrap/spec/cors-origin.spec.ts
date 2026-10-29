import { describe, expect, it } from '@jest/globals';

import { isCorsOriginAllowed, parseOriginList } from '../cors-origin';

describe('CORS origin policy', () => {
  it('allows non-browser requests without an Origin header', () => {
    expect(isCorsOriginAllowed(undefined)).toBe(true);
  });

  it('does not infer a production domain when DOMAIN_BASE is absent', () => {
    expect(isCorsOriginAllowed('https://app.trainingload.ai')).toBe(false);
    expect(isCorsOriginAllowed('http://127.0.0.1:43210')).toBe(true);
  });

  it('allows the product domains, subdomains and explicit trusted origins', () => {
    const trusted = parseOriginList(
      'https://preview.example.test, https://partner.example.test ',
    );

    expect(
      isCorsOriginAllowed('https://app.trainingload.ai', 'trainingload'),
    ).toBe(true);
    expect(
      isCorsOriginAllowed('https://preview.trainingload.ai', 'trainingload'),
    ).toBe(true);
    expect(
      isCorsOriginAllowed(
        'https://preview.example.test',
        'trainingload',
        trusted,
      ),
    ).toBe(true);
  });

  it('rejects deceptive suffixes, insecure production origins and unknown sites', () => {
    expect(
      isCorsOriginAllowed(
        'https://trainingload.ai.attacker.test',
        'trainingload',
      ),
    ).toBe(false);
    expect(
      isCorsOriginAllowed('http://app.trainingload.ai', 'trainingload'),
    ).toBe(false);
    expect(isCorsOriginAllowed('https://dxxs3.com', 'trainingload')).toBe(
      false,
    );
  });

  it('escapes a configured domain base before building the wildcard matcher', () => {
    expect(
      isCorsOriginAllowed('https://app.train.ingload.ai', 'train.ingload'),
    ).toBe(true);
    expect(
      isCorsOriginAllowed('https://app.trainXingload.ai', 'train.ingload'),
    ).toBe(false);
  });
});
