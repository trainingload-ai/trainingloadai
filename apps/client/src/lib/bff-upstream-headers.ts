export const BFF_INGRESS_CLIENT_IP_HEADER = "x-trainingload-ingress-client-ip";
export const BACKEND_CLIENT_IP_HEADER = "x-trainingload-client-ip";
export const DESKTOP_INTERNAL_CREDENTIAL_HEADER =
  "x-trainingload-desktop-credential";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

const RESPONSE_HOP_BY_HOP_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
  "content-length",
]);

function trustedIngressClientIp(source: Headers): string | null {
  // Self-host has no trusted ingress that can overwrite browser headers.
  if (process.env.NEXT_PUBLIC_SELF_HOST_MODE) return null;
  const value = source.get(BFF_INGRESS_CLIENT_IP_HEADER)?.trim();
  return value || null;
}

function addTrustedClientIp(source: Headers, target: Headers) {
  const clientIp = trustedIngressClientIp(source);
  if (clientIp) target.set(BACKEND_CLIENT_IP_HEADER, clientIp);
}

function addDesktopCredential(target: Headers) {
  const credential = process.env.DESKTOP_INTERNAL_CREDENTIAL?.trim();
  if (credential) target.set(DESKTOP_INTERNAL_CREDENTIAL_HEADER, credential);
  else target.delete(DESKTOP_INTERNAL_CREDENTIAL_HEADER);
}

/** Headers for the generic browser-to-API proxy. */
export function buildBffProxyHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) return;
    if (process.env.NEXT_PUBLIC_SELF_HOST_MODE && ["forwarded", "x-forwarded-for", "x-real-ip", "x-forwarded-host", "x-forwarded-proto"].includes(lowerKey)) return;
    // Neither header is accepted from the browser. Caddy overwrites the
    // ingress-only header, and the BFF promotes that value to the backend-only
    // header after removing both public inputs.
    if (
      lowerKey === BFF_INGRESS_CLIENT_IP_HEADER ||
      lowerKey === BACKEND_CLIENT_IP_HEADER ||
      lowerKey === DESKTOP_INTERNAL_CREDENTIAL_HEADER
    ) {
      return;
    }
    headers.set(key, value);
  });
  addTrustedClientIp(source, headers);
  addDesktopCredential(headers);
  // Avoid compressed upstream payload/header mismatch after proxying through
  // Next.js fetch(), which may transparently decompress the response.
  headers.set("accept-encoding", "identity");
  return headers;
}

/** Headers for an API response crossing the backend-to-browser BFF hop. */
export function buildBffProxyResponseHeaders(source: Headers): Headers {
  const target = new Headers();
  source.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (RESPONSE_HOP_BY_HOP_HEADERS.has(lowerKey)) return;
    // Headers.forEach() folds multiple Set-Cookie values into one comma-
    // separated string. That representation is ambiguous when Expires itself
    // contains a comma, so cookies must be copied from the runtime's dedicated
    // accessor instead.
    if (lowerKey === "set-cookie") return;
    target.set(key, value);
  });

  const cookieAwareHeaders = source as Headers & {
    getSetCookie?: () => string[];
  };
  for (const cookie of cookieAwareHeaders.getSetCookie?.() ?? []) {
    target.append("set-cookie", cookie);
  }
  target.set("cache-control", "no-store");
  return target;
}

/** Headers for purpose-built BFF handlers that call the backend directly. */
export function buildBffServiceHeaders(
  source: Headers,
  initial?: HeadersInit,
): Headers {
  const headers = new Headers(initial);
  headers.delete(BFF_INGRESS_CLIENT_IP_HEADER);
  headers.delete(BACKEND_CLIENT_IP_HEADER);
  headers.delete(DESKTOP_INTERNAL_CREDENTIAL_HEADER);
  addTrustedClientIp(source, headers);
  addDesktopCredential(headers);
  return headers;
}

/** Headers for one purpose-built BFF handler calling another BFF handler. */
export function buildBffInternalHeaders(
  source: Headers,
  initial?: HeadersInit,
): Headers {
  const headers = new Headers(initial);
  headers.delete(BACKEND_CLIENT_IP_HEADER);
  headers.delete(DESKTOP_INTERNAL_CREDENTIAL_HEADER);
  const clientIp = trustedIngressClientIp(source);
  if (clientIp) headers.set(BFF_INGRESS_CLIENT_IP_HEADER, clientIp);
  else headers.delete(BFF_INGRESS_CLIENT_IP_HEADER);
  return headers;
}
