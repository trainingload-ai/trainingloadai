import { describe, expect, it } from "vitest";
import {
  buildThirdPartyOAuthReturnUrl,
  clearThirdPartyOAuthResult,
  parseThirdPartyOAuthResult,
  thirdPartyOAuthProviderParam,
} from "./third-party-oauth-result";

describe("parseThirdPartyOAuthResult", () => {
  it("keeps a provider-specific error reason", () => {
    expect(
      parseThirdPartyOAuthResult(
        "?intervals_icu_oauth=error&reason=account_already_connected",
      ),
    ).toEqual({
      provider: "intervals_icu",
      status: "error",
      reason: "account_already_connected",
      description: null,
    });
  });

  it("recognizes a registered provider error callback", () => {
    expect(
      parseThirdPartyOAuthResult(
        `?${thirdPartyOAuthProviderParam}=intervals_icu&error=account_already_linked_to_different_user&error_description=Already+linked`,
      ),
    ).toEqual({
      provider: "intervals_icu",
      status: "error",
      reason: "account_already_linked_to_different_user",
      description: "Already linked",
    });
  });

  it("ignores providers that are not registered by this deployment", () => {
    expect(
      parseThirdPartyOAuthResult(`?${thirdPartyOAuthProviderParam}=unknown`),
    ).toBeNull();
  });

  it("ignores unrelated account-page query parameters", () => {
    expect(parseThirdPartyOAuthResult("?tab=connections")).toBeNull();
  });
});

describe("third-party OAuth return URLs", () => {
  it("marks the provider without sending a hash through the OAuth service", () => {
    const result = new URL(
      buildThirdPartyOAuthReturnUrl(
        "http://localhost/zh/account?tab=profile",
        "intervals_icu",
      ),
    );
    expect(result.searchParams.get("tab")).toBe("profile");
    expect(result.searchParams.get(thirdPartyOAuthProviderParam)).toBe(
      "intervals_icu",
    );
    expect(result.hash).toBe("");
  });

  it("clears only OAuth callback parameters", () => {
    const url = new URL(
      `http://localhost/zh/account?tab=profile&${thirdPartyOAuthProviderParam}=intervals_icu&error=invalid_code`,
    );
    clearThirdPartyOAuthResult(url);
    expect(url.toString()).toBe("http://localhost/zh/account?tab=profile");
  });
});
