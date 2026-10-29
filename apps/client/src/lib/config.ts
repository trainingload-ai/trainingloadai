/**
 * Dynamic configuration management
 * Automatically sets API base URL and region information based on the current domain
 */

export interface AppConfig {
  apiBaseUrl: string;
  region: "china" | "international";
}

const DEFAULT_SITE_URL = "https://www.trainingload.ai";
const DEFAULT_API_URL = "https://api.trainingload.ai";
const LOCAL_API_URL = "http://localhost:3001";

function getSelfHostPublicOrigin(): string | null {
  if (!process.env.NEXT_PUBLIC_SELF_HOST_MODE) return null;
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.CLIENT_PUBLIC_URL?.trim().replace(/\/+$/, "") || null;
}

/** 官网（定价页、计划分享预览等）；本地可看 docs：`NEXT_PUBLIC_MARKETING_BASE_URL=http://localhost:3000` */
export function getMarketingSiteOrigin(): string {
  const selfHostOrigin = getSelfHostPublicOrigin();
  if (selfHostOrigin) return selfHostOrigin;
  const raw = process.env.NEXT_PUBLIC_MARKETING_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/+$/, "");
  }
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "localhost"
  ) {
    return "http://localhost:3000";
  }
  return DEFAULT_SITE_URL;
}

export function getPlanSharePublicUrl(publicId: string): string {
  return `${getMarketingSiteOrigin()}/share/plans/${encodeURIComponent(publicId)}`;
}

const AUTH_UI_ENABLED = true;

function isProductionHostname(hostname: string) {
  return (
    hostname === "trainingload.ai" || hostname.endsWith(".trainingload.ai")
  );
}

/**
 * Get current application configuration
 * Automatically judges region and sets corresponding API address based on domain
 */
export function getAppConfig(): AppConfig {
  // Route handlers must use the same local API as browser auth in development,
  // including isolated worktrees where the untracked .env is absent.
  if (typeof window === "undefined") {
    return {
      apiBaseUrl:
        process.env.CLIENT_INTERNAL_API_URL ||
        (process.env.NEXT_PUBLIC_SELF_HOST_MODE ? LOCAL_API_URL : "") ||
        process.env.NEXT_PUBLIC_API_URL ||
        (process.env.NODE_ENV === "production"
          ? DEFAULT_API_URL
          : LOCAL_API_URL),
      region: "international",
    };
  }

  // All browser product traffic crosses the same-origin Next.js BFF. The
  // public API origin remains available to mobile clients, provider callbacks,
  // webhooks, and server-side fallbacks, but is never selected by web runtime
  // code. This also keeps released self-host images relocatable.
  return {
    apiBaseUrl: `${window.location.origin}/api/proxy`,
    region: "international",
  };
}

/**
 * Get API Base URL
 */
export function getApiBaseUrl(): string {
  return getAppConfig().apiBaseUrl;
}

/**
 * Get current region
 */
export function getRegion(): "china" | "international" {
  return getAppConfig().region;
}

/**
 * Get frontend base domain
 * @param hostname Optional hostname, used for passing request domain during server-side rendering
 */
/** 官网定价页（与 VIP 引导、活动 AI 分析等处一致）。默认跳 www；本地开发见 `getMarketingSiteOrigin`。 */
export function getMarketingPricingUrl(locale: string): string {
  const base = getMarketingSiteOrigin();
  return locale === "en" ? `${base}/pricing` : `${base}/${locale}/pricing`;
}

export function getBaseUrl(hostname?: string): string {
  const selfHostOrigin = getSelfHostPublicOrigin();
  if (selfHostOrigin) return selfHostOrigin;
  if (typeof window === "undefined") {
    if (hostname && isProductionHostname(hostname)) {
      return DEFAULT_SITE_URL;
    }
    return process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_SITE_URL;
  }

  const clientHostname = window.location.hostname;

  if (isProductionHostname(clientHostname)) {
    return DEFAULT_SITE_URL;
  }

  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

export function isAuthUiEnabled(): boolean {
  return AUTH_UI_ENABLED;
}
