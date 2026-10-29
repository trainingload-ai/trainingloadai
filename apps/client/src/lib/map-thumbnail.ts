export type MapThumbnailCandidates = {
  dark: string | null;
  light: string | null;
};

export function resolveMapThumbnailUrl(
  raw: string | null | undefined,
  assetBaseUrl = process.env.NEXT_PUBLIC_ASSET_BASE_URL,
): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const normalized = value.replace(/^\/+/, "");
  const base = String(assetBaseUrl ?? "")
    .trim()
    .replace(/\/+$/, "");
  return base ? `${base}/${normalized}` : `/${normalized}`;
}

export function resolveMapThumbnailCandidates({
  darkFailed,
  darkUrl,
  lightFailed,
  lightUrl,
}: {
  darkFailed: boolean;
  darkUrl: string | null;
  lightFailed: boolean;
  lightUrl: string | null;
}): MapThumbnailCandidates {
  const availableLight = lightFailed ? null : lightUrl;
  const availableDark = darkFailed ? null : darkUrl;

  return {
    light: availableLight ?? availableDark,
    dark: availableDark ?? availableLight,
  };
}
