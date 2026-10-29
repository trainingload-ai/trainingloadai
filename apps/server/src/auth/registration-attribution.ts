import {
  ACQUISITION_SOURCE_HEADER,
  normalizeAcquisitionSource,
  normalizeRegistrationMethod,
  normalizeRegistrationPlatform,
  REGISTRATION_PLATFORM_HEADER,
  type UserRegistrationAttribution,
  type UserRegistrationMethod,
} from '@shared/registration-attribution';

type HeaderReader = {
  get(name: string): string | null;
};

type RegistrationAuthContext = {
  path?: unknown;
  body?: unknown;
  headers?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function asHeaders(value: unknown): HeaderReader | undefined {
  const record = asRecord(value);
  return record && typeof record.get === 'function'
    ? (value as HeaderReader)
    : undefined;
}

function externalMethod(value: unknown): UserRegistrationMethod | undefined {
  return typeof value === 'string' && value.trim() ? 'EXTERNAL' : undefined;
}

function readDirectAttribution(
  context: RegistrationAuthContext,
): UserRegistrationAttribution {
  const body = asRecord(context.body);
  const additionalData = asRecord(body?.additionalData);
  const headers = asHeaders(context.headers);
  const path = typeof context.path === 'string' ? context.path : '';

  const registrationPlatform =
    normalizeRegistrationPlatform(additionalData?.registrationPlatform) ??
    normalizeRegistrationPlatform(headers?.get(REGISTRATION_PLATFORM_HEADER)) ??
    'UNKNOWN';
  const registrationMethod =
    normalizeRegistrationMethod(additionalData?.registrationMethod) ??
    (path === '/sign-up/email' ? 'EMAIL' : undefined) ??
    externalMethod(body?.provider) ??
    'UNKNOWN';
  const acquisitionSource =
    normalizeAcquisitionSource(additionalData?.acquisitionSource) ??
    normalizeAcquisitionSource(headers?.get(ACQUISITION_SOURCE_HEADER)) ??
    'UNKNOWN';

  return {
    registrationPlatform,
    registrationMethod,
    acquisitionSource,
  };
}

export function resolveRegistrationAttribution(
  context: RegistrationAuthContext | null,
  oauthState?: unknown,
): UserRegistrationAttribution {
  const state = asRecord(oauthState);
  if (state) {
    return {
      registrationPlatform:
        normalizeRegistrationPlatform(state.registrationPlatform) ?? 'UNKNOWN',
      registrationMethod:
        normalizeRegistrationMethod(state.registrationMethod) ??
        externalMethod(state.registrationMethod) ??
        'UNKNOWN',
      acquisitionSource:
        normalizeAcquisitionSource(state.acquisitionSource) ?? 'UNKNOWN',
    };
  }

  return context
    ? readDirectAttribution(context)
    : {
        registrationPlatform: 'UNKNOWN',
        registrationMethod: 'UNKNOWN',
        acquisitionSource: 'UNKNOWN',
      };
}
