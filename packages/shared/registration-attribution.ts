export const USER_REGISTRATION_PLATFORMS = [
  "UNKNOWN",
  "WEB",
  "IOS",
  "ANDROID",
] as const;

export type UserRegistrationPlatform =
  (typeof USER_REGISTRATION_PLATFORMS)[number];

export const USER_REGISTRATION_METHODS = [
  "UNKNOWN",
  "EMAIL",
  "EXTERNAL",
] as const;

export type UserRegistrationMethod = (typeof USER_REGISTRATION_METHODS)[number];

export const USER_ACQUISITION_SOURCES = [
  "UNKNOWN",
  "DIRECT",
  "ORGANIC",
  "PAID",
  "REFERRAL",
  "EMAIL",
  "CAMPAIGN",
  "DOCS",
  "DOCS_TOOL",
  "INTERNAL",
] as const;

export type UserAcquisitionSource = (typeof USER_ACQUISITION_SOURCES)[number];

export type UserRegistrationAttribution = {
  registrationPlatform: UserRegistrationPlatform;
  registrationMethod: UserRegistrationMethod;
  acquisitionSource: UserAcquisitionSource;
};

export const REGISTRATION_PLATFORM_HEADER = "X-Registration-Platform";
export const ACQUISITION_SOURCE_HEADER = "X-Acquisition-Source";

function normalizeEnumValue<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
): Values[number] | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase().replace(/-/g, "_");
  return allowed.includes(normalized)
    ? (normalized as Values[number])
    : undefined;
}

export function normalizeRegistrationPlatform(
  value: unknown,
): UserRegistrationPlatform | undefined {
  return normalizeEnumValue(value, USER_REGISTRATION_PLATFORMS);
}

export function normalizeRegistrationMethod(
  value: unknown,
): UserRegistrationMethod | undefined {
  return normalizeEnumValue(value, USER_REGISTRATION_METHODS);
}

export function normalizeAcquisitionSource(
  value: unknown,
): UserAcquisitionSource | undefined {
  return normalizeEnumValue(value, USER_ACQUISITION_SOURCES);
}
