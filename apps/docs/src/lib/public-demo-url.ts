const DEFAULT_PUBLIC_DEMO_HOST = "demo.trainingload.ai";

export function getPublicDemoHost() {
  const configuredHost = process.env.NEXT_PUBLIC_DEMO_HOST?.trim();
  if (configuredHost && /^[a-z0-9.-]+(?::\d+)?$/i.test(configuredHost)) {
    return configuredHost;
  }
  return DEFAULT_PUBLIC_DEMO_HOST;
}

export function getPublicDemoOrigin() {
  const host = getPublicDemoHost();
  const protocol = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host)
    ? "http"
    : "https";
  return `${protocol}://${host}`;
}

export function publicDemoDestination(lang: string, path = "") {
  const normalizedPath = path ? `/${path.replace(/^\/+|\/+$/g, "")}` : "";
  const host = getPublicDemoHost();
  return {
    address: `${host}${normalizedPath}`,
    href: `${getPublicDemoOrigin()}/${encodeURIComponent(lang)}${normalizedPath}`,
  };
}
