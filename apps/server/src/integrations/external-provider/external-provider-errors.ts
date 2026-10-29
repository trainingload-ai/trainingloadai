import { I18nContext } from 'nestjs-i18n';

import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { BusinessException } from '@/filters/business-exception/business.exception';

export type ThirdPartyErrorDefinition = {
  key: string;
  oauthReason?: string;
  code?: number;
};

/** Core 只声明通用错误和公开候选 Intervals.icu 的错误。 */
export const THIRD_PARTY_ERRORS = {
  COMMON: {
    OAUTH_STATE_MISSING: { key: 'common.error.oauth_state_missing' },
    OAUTH_STATE_INVALID: { key: 'common.error.oauth_state_invalid' },
    OAUTH_STATE_USED: { key: 'common.error.oauth_state_used' },
    SETTING_MUST_BE_BOOLEAN: { key: 'common.error.setting_must_be_boolean' },
    ACTIVITY_NOT_FOUND: {
      key: 'common.error.activity_not_found',
      code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
    },
    PLAN_WORKOUT_NOT_FOUND: {
      key: 'common.error.plan_workout_not_found',
      code: BUSINESS_ERROR_CODE.RESOURCE_NOT_FOUND,
    },
    PLAN_ID_REQUIRED: { key: 'common.error.plan_id_required' },
    PLAN_NOT_EXPORTABLE: {
      key: 'common.error.plan_not_exportable',
      code: BUSINESS_ERROR_CODE.RESOURCE_NOT_FOUND,
    },
    CONFIRMATION_REQUIRED: { key: 'common.error.confirmation_required' },
    INVALID_JSON_PAYLOAD: { key: 'common.error.invalid_json_payload' },
  },
  INTERVALS_ICU: {
    INVALID_NEWEST_DATE: {
      key: 'common.error.intervals_icu_invalid_newest_date',
    },
    API_KEY_REQUIRED: { key: 'common.error.intervals_icu_api_key_required' },
    API_KEY_VALIDATION_FAILED: {
      key: 'common.error.intervals_icu_api_key_validation_failed',
    },
    NOT_CONNECTED: {
      key: 'common.error.intervals_icu_not_connected',
      code: BUSINESS_ERROR_CODE.RESOURCE_NOT_FOUND,
    },
    CREDENTIAL_MISSING: {
      key: 'common.error.intervals_icu_credential_missing',
    },
    SCHEDULED_SYNC_DISABLED: {
      key: 'common.error.intervals_icu_scheduled_sync_disabled',
    },
    INVALID_PLANNED_WORKOUT_SYNC_DATE: {
      key: 'common.error.intervals_icu_invalid_planned_workout_sync_date',
    },
    OAUTH_NOT_CONFIGURED: {
      key: 'common.error.intervals_icu_oauth_not_configured',
    },
    OAUTH_TOKEN_MISSING: {
      key: 'common.error.intervals_icu_oauth_token_missing',
    },
    ACCOUNT_ALREADY_CONNECTED: {
      key: 'common.error.intervals_icu_account_already_connected',
      oauthReason: 'account_already_connected',
      code: BUSINESS_ERROR_CODE.CONFLICT,
    },
  },
} as const satisfies Record<string, Record<string, ThirdPartyErrorDefinition>>;

export function thirdPartyError(
  error: ThirdPartyErrorDefinition,
  args?: Record<string, string | number>,
  options?: { code?: number },
) {
  const i18n = I18nContext.current();
  const translated = i18n?.t(error.key, { lang: i18n.lang, args });
  const message =
    typeof translated === 'string' && translated.trim()
      ? translated
      : error.key;
  const exception = new BusinessException({
    code: options?.code ?? error.code ?? BUSINESS_ERROR_CODE.COMMON,
    message,
  });
  if (error.oauthReason) {
    Object.defineProperty(exception, 'oauthReason', {
      value: error.oauthReason,
      enumerable: false,
    });
  }
  return exception;
}

export function thirdPartyUnauthorized(
  error: ThirdPartyErrorDefinition,
  args?: Record<string, string | number>,
) {
  return thirdPartyError(error, args, {
    code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
  });
}

export function thirdPartyOAuthReason(error: unknown) {
  const reason = (error as { oauthReason?: unknown } | null)?.oauthReason;
  return typeof reason === 'string' ? reason : null;
}
