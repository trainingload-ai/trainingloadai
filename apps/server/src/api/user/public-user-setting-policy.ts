import type { $Enums } from '@prisma/client';

const PUBLIC_USER_SETTING_CATEGORY_VALUES = [
  'UNIT_SYSTEM',
  'POWER_UNIT',
  'THEME',
  'CHART_XAXIS',
  'TIME_FORMAT',
  'FITNESS_STATUS_LAYOUT',
  'AI_REVIEW_MODE',
  'ATHLETE_STATE_AUTO_ENABLED',
  'AI_DATA_CONSENT',
  'ATHLETE_MEMORY',
] as const satisfies readonly $Enums.SettingCategory[];

const PUBLIC_USER_SETTING_CATEGORIES = new Set<string>(
  PUBLIC_USER_SETTING_CATEGORY_VALUES,
);

export function publicUserSettingCategories(): $Enums.SettingCategory[] {
  return [...PUBLIC_USER_SETTING_CATEGORY_VALUES];
}

export function isPublicUserSettingCategory(
  category: unknown,
): category is $Enums.SettingCategory {
  return PUBLIC_USER_SETTING_CATEGORIES.has(
    String(category ?? '')
      .trim()
      .toUpperCase(),
  );
}
