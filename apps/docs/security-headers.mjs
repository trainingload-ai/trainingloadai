export function createSiteSecurityHeaders({
  allowDemoFrame = true,
  allowDevelopmentEval = false,
  allowManagedApi = true,
  allowTelemetry = true,
  demoFrameOrigin = "https://demo.trainingload.ai",
} = {}) {
  const normalizedDemoFrameOrigin = (() => {
    try {
      const url = new URL(demoFrameOrigin);
      const local =
        url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (
        (url.protocol === "https:" || (local && url.protocol === "http:")) &&
        !url.username &&
        !url.password
      ) {
        return url.origin;
      }
    } catch {
      // Fall through to the fixed production origin.
    }
    return "https://demo.trainingload.ai";
  })();
  const scriptSources = [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    ...(allowDevelopmentEval ? ["'unsafe-eval'"] : []),
    ...(allowTelemetry ? ["https://www.googletagmanager.com"] : []),
  ];
  const connectSources = [
    "connect-src 'self'",
    ...(allowManagedApi ? ["https://api.trainingload.ai"] : []),
    ...(allowTelemetry
      ? [
          "https://www.googletagmanager.com",
          "https://*.google-analytics.com",
          "https://*.analytics.google.com",
          "https://stats.g.doubleclick.net",
          "https://*.posthog.com",
          "https://*.sentry.io",
        ]
      : []),
  ];
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    scriptSources.join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    [
      "frame-src 'self'",
      ...(allowDemoFrame ? [normalizedDemoFrameOrigin] : []),
    ].join(" "),
    connectSources.join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  return [
    {
      key: "Content-Security-Policy",
      value: contentSecurityPolicy,
    },
    {
      key: "Strict-Transport-Security",
      // Deliberately scoped to www. Do not add includeSubDomains/preload until
      // every current and future subdomain has an audited HTTPS lifecycle.
      value: "max-age=31536000",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value:
        "browsing-topics=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    },
  ];
}

export const SITE_SECURITY_HEADERS = createSiteSecurityHeaders();
