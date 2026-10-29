const LOCAL_DEVELOPMENT_PORTS = [
  3000, 3001, 3002, 3003, 8081, 8082, 8083,
] as const;

function parseOriginList(input?: string): string[] {
  return (input ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function localDevelopmentOrigins(): string[] {
  return LOCAL_DEVELOPMENT_PORTS.flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
  ]);
}

export function buildTrustedOrigins(additionalOrigins?: string): string[] {
  return Array.from(
    new Set([
      'file://',
      'trainingloadmobileapp://',
      'trainingloadmobileapp://*',
      'com.anonymous.trainingload-mobile-app://',
      'com.anonymous.trainingload-mobile-app://*',
      'exp://',
      'exp://*',
      ...localDevelopmentOrigins(),
      ...parseOriginList(additionalOrigins),
    ]),
  );
}
