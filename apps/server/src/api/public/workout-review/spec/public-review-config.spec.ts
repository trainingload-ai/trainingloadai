import { describe, expect, it } from '@jest/globals';
import {
  isPublicReviewEnabled,
  readPublicReviewSecret,
} from '../public-review-config';

describe('public review configuration', () => {
  it('defaults to enabled outside production and disabled in production', () => {
    expect(isPublicReviewEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isPublicReviewEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('honors an explicit feature flag', () => {
    expect(
      isPublicReviewEnabled({
        NODE_ENV: 'production',
        PUBLIC_AI_REVIEW_ENABLED: ' true ',
      }),
    ).toBe(true);
    expect(
      isPublicReviewEnabled({
        NODE_ENV: 'development',
        PUBLIC_AI_REVIEW_ENABLED: 'false',
      }),
    ).toBe(false);
  });

  it('requires configured secrets only when production enables the feature', () => {
    expect(
      readPublicReviewSecret(
        'PUBLIC_AI_REVIEW_IDENTITY_SECRET',
        'disabled-fallback',
        { NODE_ENV: 'production', PUBLIC_AI_REVIEW_ENABLED: 'false' },
      ),
    ).toBe('disabled-fallback');

    expect(() =>
      readPublicReviewSecret(
        'PUBLIC_AI_REVIEW_IDENTITY_SECRET',
        'disabled-fallback',
        { NODE_ENV: 'production', PUBLIC_AI_REVIEW_ENABLED: 'true' },
      ),
    ).toThrow(
      'PUBLIC_AI_REVIEW_IDENTITY_SECRET is required when public AI review is enabled',
    );
  });
});
