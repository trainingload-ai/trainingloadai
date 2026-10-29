import { isIP } from 'node:net';

export type SelfHostAccessMode = 'local-owner' | 'credentials';

export type LocalBrowserRequestCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'LOCAL_ACCESS_DISABLED' | 'SAME_ORIGIN_REQUIRED';
    };

function trimmed(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() ?? '';
}

function normalizedHost(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, '');
}

export function isLoopbackHost(value: string): boolean {
  const host = normalizedHost(value);
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') {
    return true;
  }
  if (isIP(host) === 4) return host.split('.')[0] === '127';
  return false;
}

function configuredOrigin(env: NodeJS.ProcessEnv): URL | null {
  const raw =
    trimmed(env, 'NEXT_PUBLIC_APP_URL') ||
    trimmed(env, 'NEXT_PUBLIC_BASE_URL') ||
    trimmed(env, 'NEXT_PUBLIC_API_URL');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function effectivePort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

function matchesConfiguredBrowserOrigin(
  requestOrigin: string | undefined,
  expectedOrigin: URL | null,
): boolean {
  if (!requestOrigin || !expectedOrigin) return false;

  let parsedRequestOrigin: URL;
  try {
    parsedRequestOrigin = new URL(requestOrigin);
  } catch {
    return false;
  }

  if (
    parsedRequestOrigin.origin === expectedOrigin.origin ||
    (isLoopbackHost(parsedRequestOrigin.hostname) &&
      isLoopbackHost(expectedOrigin.hostname) &&
      parsedRequestOrigin.protocol === expectedOrigin.protocol &&
      effectivePort(parsedRequestOrigin) === effectivePort(expectedOrigin))
  ) {
    return true;
  }

  return false;
}

export function resolveSelfHostAccessMode(
  env: NodeJS.ProcessEnv = process.env,
): SelfHostAccessMode {
  if (!trimmed(env, 'SELF_HOST_MODE')) return 'credentials';
  const bind = trimmed(env, 'SELF_HOST_HTTP_BIND') || '127.0.0.1';
  const origin = configuredOrigin(env);
  return isLoopbackHost(bind) && origin && isLoopbackHost(origin.hostname)
    ? 'local-owner'
    : 'credentials';
}

export function checkLocalBrowserRequest(
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env,
): LocalBrowserRequestCheck {
  if (resolveSelfHostAccessMode(env) !== 'local-owner') {
    return { ok: false, reason: 'LOCAL_ACCESS_DISABLED' };
  }

  const expectedOrigin = configuredOrigin(env);
  const requestOrigin = headers.get('origin')?.trim();
  const fetchSite = headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (
    !matchesConfiguredBrowserOrigin(requestOrigin, expectedOrigin) ||
    fetchSite !== 'same-origin'
  ) {
    return { ok: false, reason: 'SAME_ORIGIN_REQUIRED' };
  }

  return { ok: true };
}
