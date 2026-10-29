export type AuthCookiePolicy = {
  useSecureCookies: boolean;
  cookiePrefix?: string;
  crossSubDomainCookies?: {
    enabled: true;
    domain: string;
  };
};

function readPublicOrigin(publicBaseUrl: string): URL | null {
  try {
    return new URL(publicBaseUrl);
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '0.0.0.0' ||
    normalized.startsWith('127.')
  );
}

function loopbackCookiePrefix(publicOrigin: URL, selfHost: boolean): string {
  const port =
    publicOrigin.port || (publicOrigin.protocol === 'https:' ? '443' : '80');
  const deployment = selfHost ? 'self-host' : 'cloud';
  return `trainingload-${deployment}-${port}`;
}

export function resolveAuthCookiePolicy(input: {
  production: boolean;
  selfHost: boolean;
  publicBaseUrl: string;
  managedDomainBase: string;
}): AuthCookiePolicy {
  const publicOrigin = readPublicOrigin(input.publicBaseUrl);
  if (publicOrigin && isLoopbackHostname(publicOrigin.hostname)) {
    // Cookie scope deliberately ignores ports. Cloud and Self-host are often
    // accepted side by side on localhost, so the default Better Auth cookie
    // name would let either instance overwrite the other's login session.
    return {
      useSecureCookies: input.production && publicOrigin.protocol === 'https:',
      cookiePrefix: loopbackCookiePrefix(publicOrigin, input.selfHost),
    };
  }

  if (!input.production) return { useSecureCookies: false };

  if (input.selfHost) {
    return {
      // Local and private-LAN installations commonly start with explicit HTTP.
      // A Secure cookie would make login appear successful while the browser
      // silently refuses to send the resulting session cookie.
      useSecureCookies: publicOrigin?.protocol === 'https:',
    };
  }

  return {
    useSecureCookies: true,
    crossSubDomainCookies: {
      enabled: true,
      domain: `.${input.managedDomainBase}.ai`,
    },
  };
}
