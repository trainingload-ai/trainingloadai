import { describe, expect, it } from "vitest";

import { isBetterAuthSessionCookieName } from "./auth-cookie-name";

describe("isBetterAuthSessionCookieName", () => {
  it.each([
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
    "__Host-better-auth.session-token",
    "trainingload-cloud-3001.session_token",
    "trainingload-self-host-43211.session_token",
    "trainingload-cloud-3001.session_token.0",
  ])("accepts Better Auth session cookie %s", (name) => {
    expect(isBetterAuthSessionCookieName(name)).toBe(true);
  });

  it.each([
    "trainingload.public-demo",
    "session_token",
    "better-auth.session_data",
    "unrelated",
  ])("rejects non-session cookie %s", (name) => {
    expect(isBetterAuthSessionCookieName(name)).toBe(false);
  });
});
