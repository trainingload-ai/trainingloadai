export type PublicDemoLocalizedText = {
  zh: string;
  en: string;
};

export function serializePublicDemoText(value: PublicDemoLocalizedText) {
  return JSON.stringify(value);
}

/**
 * Reads legacy localized text without importing the Cloud demo dataset or its
 * provisioning services.
 */
export function readPublicDemoText(value: string, locale: string) {
  try {
    const parsed = JSON.parse(value) as Partial<PublicDemoLocalizedText>;
    if (!parsed || typeof parsed !== 'object') return value;
    const selected = locale.toLowerCase().startsWith('zh')
      ? (parsed.zh ?? parsed.en)
      : (parsed.en ?? parsed.zh);
    return typeof selected === 'string' && selected.trim() ? selected : value;
  } catch {
    return value;
  }
}
