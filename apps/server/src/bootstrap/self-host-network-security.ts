import { isIP } from 'node:net';

export type SelfHostNetworkSecurityResult = {
  errors: string[];
  warnings: string[];
};

function value(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() ?? '';
}

function enabled(env: NodeJS.ProcessEnv, key: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value(env, key).toLowerCase());
}

function parsePublicOrigin(
  raw: string,
  key: string,
  errors: string[],
): URL | null {
  if (!raw) {
    errors.push(`${key} is required for self-host deployments`);
    return null;
  }
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    if (url.username || url.password || url.search || url.hash)
      throw new Error();
    if (url.pathname !== '/' && url.pathname !== '') throw new Error();
    return url;
  } catch {
    errors.push(
      `${key} must be an absolute HTTP(S) origin without credentials, path, query, or fragment`,
    );
    return null;
  }
}

function ipv4Parts(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  return numbers.every(
    (part, index) =>
      Number.isInteger(part) &&
      part >= 0 &&
      part <= 255 &&
      String(part) === parts[index],
  )
    ? numbers
    : null;
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.home.arpa')
  ) {
    return true;
  }
  const ip = ipv4Parts(normalized);
  if (ip) {
    return (
      ip[0] === 127 ||
      ip[0] === 10 ||
      (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) ||
      (ip[0] === 192 && ip[1] === 168) ||
      (ip[0] === 169 && ip[1] === 254)
    );
  }
  if (isIP(normalized) !== 6) return false;
  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

function isLoopbackBind(bind: string): boolean {
  const normalized = bind.toLowerCase().replace(/^\[|\]$/g, '');
  return ['127.0.0.1', '::1', 'localhost'].includes(normalized);
}

export function validateSelfHostNetworkSecurity(
  env: NodeJS.ProcessEnv,
): SelfHostNetworkSecurityResult {
  if (!value(env, 'SELF_HOST_MODE')) return { errors: [], warnings: [] };

  const errors: string[] = [];
  const warnings: string[] = [];
  const appUrl = parsePublicOrigin(
    value(env, 'NEXT_PUBLIC_APP_URL'),
    'NEXT_PUBLIC_APP_URL',
    errors,
  );
  const apiUrl = parsePublicOrigin(
    value(env, 'NEXT_PUBLIC_API_URL'),
    'NEXT_PUBLIC_API_URL',
    errors,
  );
  if (appUrl && apiUrl && appUrl.origin !== apiUrl.origin) {
    errors.push(
      'NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_API_URL must use the same origin in self-host deployments',
    );
  }

  const trustedOrigins = value(env, 'TRUSTED_ORIGINS')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (appUrl && !trustedOrigins.includes(appUrl.origin)) {
    errors.push('TRUSTED_ORIGINS must include NEXT_PUBLIC_APP_URL');
  }

  const bind = value(env, 'SELF_HOST_HTTP_BIND') || '127.0.0.1';
  if (appUrl?.protocol === 'http:') {
    const localOrigin = isPrivateOrLocalHostname(appUrl.hostname);
    const loopbackOrigin = isLoopbackBind(appUrl.hostname);
    if (!localOrigin) {
      if (!enabled(env, 'SELF_HOST_ALLOW_INSECURE_HTTP')) {
        errors.push(
          'Public self-host origins must use HTTPS; set SELF_HOST_ALLOW_INSECURE_HTTP=true only after explicitly accepting this unsafe exception',
        );
      } else {
        warnings.push(
          'SELF_HOST_INSECURE_PUBLIC_HTTP: explicit unsafe override is active; configure HTTPS before exposing this instance',
        );
      }
    } else if (!loopbackOrigin) {
      warnings.push(
        'SELF_HOST_INSECURE_LAN_HTTP: credentials and session cookies are unencrypted on the local network',
      );
    }
    if (!isLoopbackBind(bind) && isLoopbackBind(appUrl.hostname)) {
      errors.push(
        'A non-loopback SELF_HOST_HTTP_BIND requires NEXT_PUBLIC_APP_URL to name the LAN or public host instead of localhost',
      );
    }
  }
  return { errors, warnings };
}

export function resolveTrustProxySetting(
  env: NodeJS.ProcessEnv,
): false | number | string[] {
  if (env.NODE_ENV !== 'production') return false;
  if (value(env, 'SELF_HOST_MODE')) {
    // Direct single-owner topology does not accept forwarded client identity.
    // Client and database ports remain private to the Compose network.
    return false;
  }
  return 1;
}
