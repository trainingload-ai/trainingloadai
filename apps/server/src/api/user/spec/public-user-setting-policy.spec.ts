import { describe, expect, it } from '@jest/globals';

import {
  isPublicUserSettingCategory,
  publicUserSettingCategories,
} from '../public-user-setting-policy';

describe('public user setting policy', () => {
  it('accepts Core settings without exposing Managed-only categories', () => {
    expect(isPublicUserSettingCategory('theme')).toBe(true);
    expect(isPublicUserSettingCategory('AI_REVIEW_MODE')).toBe(true);
    expect(isPublicUserSettingCategory('AI_PLAN')).toBe(false);
    expect(isPublicUserSettingCategory('')).toBe(false);
  });

  it('only queries categories the Core Prisma client can deserialize', () => {
    expect(publicUserSettingCategories()).toContain('AI_REVIEW_MODE');
    expect(publicUserSettingCategories()).not.toContain('AI_PLAN');
  });
});
