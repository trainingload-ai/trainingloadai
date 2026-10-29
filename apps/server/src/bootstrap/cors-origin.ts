function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseOriginList(input?: string): string[] {
  return (input ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  domainBase?: string,
  trustedOrigins: readonly string[] = [],
): boolean {
  // curl、移动端客户端和同域服务端请求通常没有 Origin。
  if (!origin) return true;

  const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:80',
    'http://localhost',
    ...trustedOrigins,
  ]);
  const normalizedDomainBase = domainBase?.trim();
  if (normalizedDomainBase) {
    allowedOrigins.add(`https://${normalizedDomainBase}.ai`);
    allowedOrigins.add(`https://www.${normalizedDomainBase}.ai`);
    allowedOrigins.add(`https://api.${normalizedDomainBase}.ai`);
    allowedOrigins.add(`https://app.${normalizedDomainBase}.ai`);
  }

  if (allowedOrigins.has(origin)) return true;

  const wildcardMatch = normalizedDomainBase
    ? new RegExp(
        `^https:\\/\\/([a-zA-Z0-9-]+\\.)*${escapeRegex(normalizedDomainBase)}\\.ai$`,
      )
    : null;
  const localhostMatch = /^http:\/\/localhost(:\d+)?$/;
  const localIpMatch = /^http:\/\/127\.0\.0\.1(:\d+)?$/;

  return (
    Boolean(wildcardMatch?.test(origin)) ||
    localhostMatch.test(origin) ||
    localIpMatch.test(origin)
  );
}
