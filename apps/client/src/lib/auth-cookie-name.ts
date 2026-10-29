const BETTER_AUTH_SESSION_COOKIE = /^.+\.session(?:_|-)token(?:\.\d+)?$/;

/**
 * Better Auth allows deployments to choose their own cookie prefix. Keep the
 * BFF's cheap preflight generic so local Cloud and Self-host instances can use
 * isolated cookie names without being mistaken for anonymous requests.
 */
export function isBetterAuthSessionCookieName(name: string): boolean {
  const normalized = name.replace(/^__(?:Secure|Host)-/, "");
  return BETTER_AUTH_SESSION_COOKIE.test(normalized);
}
