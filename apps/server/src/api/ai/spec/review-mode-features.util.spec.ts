import { describe, expect, it } from '@jest/globals';
import { parseAiReviewModeFeatures } from '../review-mode-features.util';

describe('review-mode-features util', () => {
  it('defaults every review mode on when the setting is unset or invalid', () => {
    expect(parseAiReviewModeFeatures(undefined)).toEqual({
      activityReview: true,
      dailyReview: true,
      weeklyReview: true,
      monthlyReview: true,
      planReview: true,
    });
    expect(parseAiReviewModeFeatures('not-json')).toEqual({
      activityReview: true,
      dailyReview: true,
      weeklyReview: true,
      monthlyReview: true,
      planReview: true,
    });
  });

  it.each(['1', 'true', '是'])(
    'treats legacy %s as all review modes on',
    (raw) => {
      expect(parseAiReviewModeFeatures(raw)).toEqual({
        activityReview: true,
        dailyReview: true,
        weeklyReview: true,
        monthlyReview: true,
        planReview: true,
      });
    },
  );

  it.each(['0', 'false', 'no'])(
    'treats legacy %s as all review modes off',
    (raw) => {
      expect(parseAiReviewModeFeatures(raw)).toEqual({
        activityReview: false,
        dailyReview: false,
        weeklyReview: false,
        monthlyReview: false,
        planReview: false,
      });
    },
  );

  it('keeps missing JSON feature keys enabled and honors explicit false values', () => {
    expect(
      parseAiReviewModeFeatures(
        JSON.stringify({
          activityReview: false,
          weeklyReview: false,
          planReview: true,
        }),
      ),
    ).toEqual({
      activityReview: false,
      dailyReview: true,
      weeklyReview: false,
      monthlyReview: true,
      planReview: true,
    });
  });
});
