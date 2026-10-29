import {
  isProductAnalyticsToolId,
  isToolCtaPlacement,
  PRODUCT_ANALYTICS_SCHEMA_VERSION,
  toGa4ToolName,
} from "@shared/product-analytics";
import type { AnalyticsProperties } from "@/lib/analytics";

export const APP_SESSION_STARTED_EVENT = "app_session_started";
export const APP_SESSION_STARTED_STORAGE_KEY =
  "analytics:app-session-started:v1";
export const APP_ENTRY_ATTRIBUTION_STORAGE_KEY =
  "analytics:app-entry-attribution:v1";

export type AppEntrySource =
  | "campaign"
  | "direct"
  | "docs"
  | "docs_tool"
  | "email"
  | "internal"
  | "organic"
  | "paid"
  | "referral"
  | "unknown";

type SearchParamsReader = Pick<URLSearchParams, "get">;
type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export type SignUpAttribution = {
  cta_name?: "start_free";
  source_context: "docs" | "other" | "tool_page";
  source_page: string;
  signup_source: AppEntrySource;
  tool_name?: string;
};

const PAID_MEDIA = new Set([
  "cpc",
  "display",
  "paid",
  "paid-social",
  "paid_social",
  "ppc",
]);
const EMAIL_MEDIA = new Set(["email", "newsletter"]);
const SEARCH_HOSTS = [
  "baidu.com",
  "bing.com",
  "duckduckgo.com",
  "google.com",
  "search.yahoo.com",
  "yandex.com",
];

function isHostOrSubdomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function sourceFromExplicitEntry(searchParams: SearchParamsReader) {
  const from = searchParams.get("from")?.trim().toLowerCase();

  if (from === "docs-tool") return "docs_tool" satisfies AppEntrySource;
  if (
    from?.startsWith("docs") ||
    from === "converter" ||
    from === "fit-course-converter" ||
    from?.startsWith("free_ai_workout_review")
  ) {
    return "docs" satisfies AppEntrySource;
  }

  return undefined;
}

function sourceFromCampaign(searchParams: SearchParamsReader) {
  const medium = searchParams.get("utm_medium")?.trim().toLowerCase();

  if (medium && EMAIL_MEDIA.has(medium)) {
    return "email" satisfies AppEntrySource;
  }
  if (medium && PAID_MEDIA.has(medium)) {
    return "paid" satisfies AppEntrySource;
  }
  if (
    medium ||
    searchParams.get("utm_source") ||
    searchParams.get("utm_campaign")
  ) {
    return "campaign" satisfies AppEntrySource;
  }

  return undefined;
}

export function resolveAppEntrySource({
  searchParams,
  referrer,
  origin,
}: {
  searchParams: SearchParamsReader;
  referrer: string;
  origin: string;
}): AppEntrySource {
  const explicitEntry = sourceFromExplicitEntry(searchParams);
  if (explicitEntry) return explicitEntry;

  const campaign = sourceFromCampaign(searchParams);
  if (campaign) return campaign;
  if (!referrer) return "direct";

  try {
    const referrerUrl = new URL(referrer);
    const currentUrl = new URL(origin);
    const hostname = referrerUrl.hostname.toLowerCase();

    if (hostname === currentUrl.hostname.toLowerCase()) return "internal";
    if (hostname === "trainingload.ai" || hostname === "www.trainingload.ai") {
      return "docs";
    }
    if (SEARCH_HOSTS.some((domain) => isHostOrSubdomain(hostname, domain))) {
      return "organic";
    }

    return "referral";
  } catch {
    return "unknown";
  }
}

export function buildAppSessionStartedProperties({
  pathname,
  authenticated,
  searchParams,
  referrer,
  origin,
}: {
  pathname: string;
  authenticated: boolean;
  searchParams: SearchParamsReader;
  referrer: string;
  origin: string;
}): AnalyticsProperties {
  const sourceToolId = searchParams.get("tool")?.trim();
  const ctaPlacement = searchParams.get("cta")?.trim();

  return {
    event_schema_version: PRODUCT_ANALYTICS_SCHEMA_VERSION,
    landing_path: pathname,
    auth_state: authenticated ? "authenticated" : "anonymous",
    entry_source: resolveAppEntrySource({ searchParams, referrer, origin }),
    source_tool_id: isProductAnalyticsToolId(sourceToolId)
      ? sourceToolId
      : undefined,
    cta_placement: isToolCtaPlacement(ctaPlacement) ? ctaPlacement : undefined,
  };
}

export function buildSignUpAttribution(
  appEntry: ReturnType<typeof buildAppSessionStartedProperties>,
): SignUpAttribution {
  const entrySource = appEntry.entry_source as AppEntrySource;
  const sourceToolId =
    typeof appEntry.source_tool_id === "string"
      ? appEntry.source_tool_id
      : undefined;

  return {
    signup_source: entrySource,
    source_page: String(appEntry.landing_path),
    source_context: sourceToolId
      ? "tool_page"
      : entrySource === "docs"
        ? "docs"
        : "other",
    tool_name: toGa4ToolName(sourceToolId),
    cta_name: sourceToolId ? "start_free" : undefined,
  };
}

export function rememberSignUpAttribution(
  attribution: SignUpAttribution,
  storage?: SessionStorageLike,
) {
  try {
    if (!storage || storage.getItem(APP_ENTRY_ATTRIBUTION_STORAGE_KEY)) return;
    storage.setItem(
      APP_ENTRY_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(attribution),
    );
  } catch {
    // Attribution is useful but must never block navigation or authentication.
  }
}

export function readSignUpAttribution(
  storage?: Pick<Storage, "getItem">,
): SignUpAttribution | undefined {
  try {
    const raw = storage?.getItem(APP_ENTRY_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<SignUpAttribution>;
    if (
      typeof value.source_page !== "string" ||
      typeof value.source_context !== "string" ||
      typeof value.signup_source !== "string"
    ) {
      return undefined;
    }
    return value as SignUpAttribution;
  } catch {
    return undefined;
  }
}

export function createAppSessionStartClaimer() {
  let claimedInMemory = false;

  return (storage?: SessionStorageLike) => {
    if (claimedInMemory) return false;

    try {
      if (storage?.getItem(APP_SESSION_STARTED_STORAGE_KEY) === "1") {
        claimedInMemory = true;
        return false;
      }
      storage?.setItem(APP_SESSION_STARTED_STORAGE_KEY, "1");
    } catch {
      // sessionStorage may be blocked; the in-memory guard still deduplicates.
    }

    claimedInMemory = true;
    return true;
  };
}

export const claimAppSessionStart = createAppSessionStartClaimer();
