export const THIRD_PARTY_PROVIDER_BRANDS = {
  intervals_icu: {
    name: "Intervals.icu",
    favicon: "/logo/provider-favicons/intervals-icu.ico",
  },
} as const satisfies Record<string, { name: string; favicon: string }>;

export const THIRD_PARTY_OAUTH_PROVIDERS = ["intervals_icu"] as const;
export const THIRD_PARTY_OAUTH_RESULT_PARAMS: Record<string, string> = {
  intervals_icu: "intervals_icu_oauth",
};
export const THIRD_PARTY_OAUTH_PENDING_STORAGE_KEYS: Record<string, string> =
  {};

export function getThirdPartyProviderName(providerId: string) {
  const normalized = providerId
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  return (THIRD_PARTY_PROVIDER_BRANDS as Record<string, { name: string }>)[
    normalized
  ]?.name;
}

const badgeRowFrame = "h-11 w-[76px] px-2";
const badgeGridFrame = "h-9 w-[76px] px-2";

export function getThirdPartyProviderLogoFrameClassName(
  providerId: string,
  connected: boolean,
  layout: "grid" | "row",
) {
  if (providerId === "garmin") {
    // Solid Garmin-blue badge tile; white wordmark fills the icon slot.
    return `${layout === "row" ? badgeRowFrame : badgeGridFrame} border-transparent bg-[#007DC3]`;
  }
  if (providerId === "coros") {
    return `${layout === "row" ? badgeRowFrame : badgeGridFrame} border-border bg-white dark:border-neutral-700 dark:bg-neutral-900`;
  }
  if (providerId === "intervals_icu" && layout === "row") {
    return `${badgeRowFrame} border-border bg-white dark:border-neutral-700`;
  }
  return `${layout === "row" ? badgeRowFrame : "w-9 px-0"} ${
    connected
      ? "border-border bg-background dark:border-neutral-600 dark:bg-neutral-900/80"
      : "border-transparent bg-neutral-200/90 dark:bg-neutral-800/80"
  }`;
}

export function getThirdPartyProviderLogoSizeClassName(
  providerId: string,
  layout: "grid" | "row",
) {
  if (providerId === "garmin" || providerId === "coros") {
    // Wide wordmark inside the badge tile (not a 20×20 square).
    return layout === "row" ? "h-5 w-auto max-w-full" : "h-4 w-auto max-w-full";
  }
  if (layout === "row" && providerId === "intervals_icu") return "size-7";
  return "h-5 w-5";
}

export function getThirdPartyProviderIconClassName(
  providerId: string,
  connected: boolean,
) {
  if (providerId === "garmin" || providerId === "coros") {
    // Brand PNGs already carry the correct light/dark treatment.
    return "";
  }
  if (providerId === "intervals_icu") {
    return connected ? "" : "grayscale opacity-55";
  }
  return connected
    ? "text-foreground"
    : "text-neutral-400 dark:text-neutral-500";
}
