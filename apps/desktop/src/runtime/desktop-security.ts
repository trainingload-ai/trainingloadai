export function normalizedAllowedOrigins(values: readonly string[]) {
  return new Set(
    values.flatMap((value) => {
      try {
        const url = new URL(value.trim());
        return url.protocol === "https:" ? [url.origin] : [];
      } catch {
        return [];
      }
    }),
  );
}

export function isAllowedExternalUrl(
  rawUrl: string,
  allowedOrigins: ReadonlySet<string>,
) {
  try {
    const url = new URL(rawUrl);
    return (
      isExternalWebUrl(rawUrl) &&
      url.protocol === "https:" &&
      allowedOrigins.has(url.origin)
    );
  } catch {
    return false;
  }
}

/** Only ordinary web URLs can be handed to the browser after confirmation. */
export function isExternalWebUrl(rawUrl: string) {
  try {
    if (/[\u0000-\u001f\u007f]/.test(rawUrl)) return false;
    const url = new URL(rawUrl);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isLocalNavigation(rawUrl: string, applicationOrigin: string) {
  try {
    return new URL(rawUrl).origin === applicationOrigin;
  } catch {
    return false;
  }
}
