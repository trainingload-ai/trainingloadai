export const AI_DATA_CONSENT_REQUIRED_CODE = "10015";

const AI_DATA_CONSENT_REQUIRED_EVENT = "trainingload:ai-data-consent-required";

export function isAiDataConsentRequiredCode(errorCode?: string) {
  return (
    errorCode === AI_DATA_CONSENT_REQUIRED_CODE ||
    errorCode === "AI_DATA_CONSENT_REQUIRED"
  );
}

export function notifyAiDataConsentRequired(errorCode?: string) {
  if (!isAiDataConsentRequiredCode(errorCode)) return false;
  if (typeof window === "undefined") return true;
  window.dispatchEvent(new Event(AI_DATA_CONSENT_REQUIRED_EVENT));
  return true;
}

export async function notifyAiDataConsentRequiredFromResponse(
  response: Response,
) {
  if (response.status !== 403) return;
  try {
    const body = (await response.clone().json()) as {
      code?: number;
      errorCode?: string;
      message?: string;
    };
    notifyAiDataConsentRequired(
      body.errorCode ??
        (typeof body.code === "number" ? String(body.code) : body.message),
    );
  } catch {
    // A non-JSON 403 cannot be identified as the consent-specific error.
  }
}

export function subscribeToAiDataConsentRequired(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AI_DATA_CONSENT_REQUIRED_EVENT, listener);
  return () =>
    window.removeEventListener(AI_DATA_CONSENT_REQUIRED_EVENT, listener);
}
