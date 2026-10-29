import {
  ACQUISITION_SOURCE_HEADER,
  normalizeAcquisitionSource,
  type UserRegistrationAttribution,
  type UserRegistrationMethod,
} from "@shared/registration-attribution";
import {
  readSignUpAttribution,
  type SignUpAttribution,
} from "@/lib/app-entry-analytics";
import { resolveDeploymentAcquisitionSource } from "@deployment/registration-attribution";

function acquisitionSourceFromAttribution(
  attribution: SignUpAttribution | undefined,
): UserRegistrationAttribution["acquisitionSource"] {
  const callbackUrl =
    typeof window === "undefined"
      ? undefined
      : new URLSearchParams(window.location.search).get("callbackURL") ||
        new URLSearchParams(window.location.search).get("callbackUrl");
  const deploymentSource = resolveDeploymentAcquisitionSource({
    sourcePage: attribution?.source_page,
    callbackUrl,
    origin: typeof window === "undefined" ? undefined : window.location.origin,
  });
  if (deploymentSource) return deploymentSource;
  if (!attribution) return "UNKNOWN";
  return normalizeAcquisitionSource(attribution.signup_source) ?? "UNKNOWN";
}

export function getWebRegistrationAttribution(
  registrationMethod: Exclude<UserRegistrationMethod, "UNKNOWN">,
): UserRegistrationAttribution {
  const attribution =
    typeof window === "undefined"
      ? undefined
      : readSignUpAttribution(window.sessionStorage);
  return {
    registrationPlatform: "WEB",
    registrationMethod,
    acquisitionSource: acquisitionSourceFromAttribution(attribution),
  };
}

export function getWebAcquisitionHeaders(): Record<string, string> {
  return {
    [ACQUISITION_SOURCE_HEADER]:
      getWebRegistrationAttribution("EMAIL").acquisitionSource,
  };
}
