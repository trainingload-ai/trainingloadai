import {
  THIRD_PARTY_OAUTH_PENDING_STORAGE_KEYS,
  THIRD_PARTY_OAUTH_PROVIDERS,
  THIRD_PARTY_OAUTH_RESULT_PARAMS,
} from "@deployment/provider-presentation";

export const thirdPartyOAuthProviderParam =
  "trainingload_third_party_oauth_provider";

export type ThirdPartyOAuthProvider = string;

export type ThirdPartyOAuthResult = {
  provider: ThirdPartyOAuthProvider;
  status: "connected" | "error";
  reason: string | null;
  description: string | null;
};

const knownProviders = new Set<ThirdPartyOAuthProvider>([
  ...THIRD_PARTY_OAUTH_PROVIDERS,
]);

function isKnownProvider(value: string): value is ThirdPartyOAuthProvider {
  return knownProviders.has(value as ThirdPartyOAuthProvider);
}

export function parseThirdPartyOAuthResult(
  search: string,
): ThirdPartyOAuthResult | null {
  const params = new URLSearchParams(search);

  for (const [provider, resultParam] of Object.entries(
    THIRD_PARTY_OAUTH_RESULT_PARAMS,
  )) {
    const status = params.get(resultParam);
    if (!status) continue;
    return {
      provider,
      status: status === "connected" ? "connected" : "error",
      reason: params.get("reason"),
      description: null,
    };
  }

  const provider = params.get(thirdPartyOAuthProviderParam);
  if (!provider || !isKnownProvider(provider)) return null;

  const reason = params.get("error");
  return {
    provider,
    status: reason ? "error" : "connected",
    reason,
    description: params.get("error_description"),
  };
}

export function buildThirdPartyOAuthReturnUrl(
  href: string,
  provider: ThirdPartyOAuthProvider,
) {
  const url = new URL(href);
  clearThirdPartyOAuthResult(url);
  url.searchParams.set(thirdPartyOAuthProviderParam, provider);
  url.hash = "";
  return url.toString();
}

export function clearThirdPartyOAuthResult(url: URL) {
  url.searchParams.delete(thirdPartyOAuthProviderParam);
  Object.values(THIRD_PARTY_OAUTH_RESULT_PARAMS).forEach((param) => {
    url.searchParams.delete(param);
  });
  url.searchParams.delete("reason");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
}

export function clearPendingThirdPartyOAuthState(
  provider: ThirdPartyOAuthProvider,
) {
  if (typeof window === "undefined") return;
  const storageKey = THIRD_PARTY_OAUTH_PENDING_STORAGE_KEYS[provider];
  if (storageKey) window.sessionStorage.removeItem(storageKey);
}
