import { createRequire } from "node:module";
import { createMDX } from "fumadocs-mdx/next";
import createNextIntlPlugin from "next-intl/plugin";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import { createSiteSecurityHeaders } from "./security-headers.mjs";
import {
  isDocsTelemetryEnabled,
  isSelfHostedDocs,
} from "./src/lib/telemetry-config.mjs";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
const withMDX = createMDX();
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// Next 只自动加载 apps/docs/.env*。本地 API/App 端口写在仓库根 .env（例如 3011/3012）。
// 不覆盖 process.env 里已有的值，所以 Vercel/CI 注入的变量仍然优先。
loadEnvConfig(repoRoot);

const nextBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS ?? "", 10);
const nextDistDir = process.env.NEXT_DIST_DIR?.trim();
const selfHosted = isSelfHostedDocs();
const telemetryEnabled = isDocsTelemetryEnabled();
const sentryAuthToken = telemetryEnabled
  ? process.env.SENTRY_AUTH_TOKEN
  : undefined;
const configuredDemoHost = process.env.NEXT_PUBLIC_DEMO_HOST?.trim();
const validDemoHost =
  configuredDemoHost && /^[a-z0-9.-]+(?::\d+)?$/i.test(configuredDemoHost)
    ? configuredDemoHost
    : "demo.trainingload.ai";
const demoFrameProtocol = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(
  validDemoHost,
)
  ? "http"
  : "https";
const siteSecurityHeaders = createSiteSecurityHeaders({
  allowDemoFrame: !selfHosted,
  allowDevelopmentEval: process.env.NODE_ENV === "development",
  allowManagedApi: !selfHosted,
  allowTelemetry: telemetryEnabled,
  demoFrameOrigin: `${demoFrameProtocol}://${validDemoHost}`,
});

/** @type {import('next').NextConfig} */
const config = {
  // Allow release verification to use an isolated output directory while a
  // local `next dev` process is still using the default `.next` directory.
  ...(nextDistDir ? { distDir: nextDistDir } : {}),
  // 为自托管 Docker 镜像生成最小运行目录；monorepo 依赖从仓库根追踪。
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    // Keep monorepo runtime resources explicit. The Markdown API resolves files
    // from process.cwd() with dynamic locale/slug segments, which static tracing
    // cannot enumerate reliably without this narrow include.
    "/*": ["../../packages/messages/docs/**/*.json", "../../packages/shared/**/*"],
    "/api/docs-markdown/\\[lang\\]/\\[\\[\\.\\.\\.slug\\]\\]": [
      "./content/docs/**/*",
    ],
  },
  productionBrowserSourceMaps: Boolean(sentryAuthToken),
  poweredByHeader: false,
  // Source maps used only to improve build-time prerender stack traces are
  // too expensive for the memory-constrained production image builder.
  enablePrerenderSourceMaps: false,
  reactStrictMode: true,
  experimental: {
    // Next defaults to the host CPU count. Production builds run on the same
    // 8 GB self-hosted machine as the live containers, so keep build workers
    // explicitly bounded when the Dockerfile supplies NEXT_BUILD_CPUS.
    cpus:
      Number.isSafeInteger(nextBuildCpus) && nextBuildCpus > 0
        ? nextBuildCpus
        : undefined,
    serverSourceMaps: Boolean(sentryAuthToken),
  },
  devIndicators: {
    position: "bottom-right",
  },
  turbopack: {
    root: repoRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
      },
      {
        protocol: "https",
        hostname: "abs.twimg.com",
      },
      {
        protocol: "https",
        hostname: "ui-avatars.com",
      },
      {
        protocol: "https",
        hostname: "www.google.com",
      },
      {
        protocol: "https",
        hostname: "thumbs.trainingload.ai",
      },
      {
        protocol: "https",
        hostname: "thumbs-dev.trainingload.ai",
      },
      {
        protocol: "https",
        hostname: "assets.trainingload.ai",
      },
    ],
  },
  async headers() {
    const legalPageHeaders = [
      {
        key: "Cache-Control",
        value: "public, max-age=0, must-revalidate, no-transform",
      },
    ];
    const localizedLegalSources = ["privacy", "terms-and-conditions"].map(
      (page) => ({
        source: `/:lang(en|de|fr|es|pt-BR|it|ko|ja|zh|zh-hant)/${page}`,
        headers: legalPageHeaders,
      }),
    );

    return [
      {
        source: "/(.*)",
        headers: siteSecurityHeaders,
      },
      ...["privacy", "terms-and-conditions"].map((page) => ({
        source: `/${page}`,
        headers: legalPageHeaders,
      })),
      ...localizedLegalSources,
    ];
  },
  async redirects() {
    return [
      {
        source: "/docs.mdx",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/:lang(en|de|fr|es|pt-BR|it|ko|ja|zh|zh-hant)/docs.mdx",
        destination: "/:lang/docs",
        permanent: true,
      },
      {
        source: "/docs/:path*.mdx",
        destination: "/docs/:path*",
        permanent: true,
      },
      {
        source: "/:lang(en|de|fr|es|pt-BR|it|ko|ja|zh|zh-hant)/docs/:path*.mdx",
        destination: "/:lang/docs/:path*",
        permanent: true,
      },
      {
        source: "/docs/:path*.md",
        destination: "/docs/:path*",
        permanent: true,
      },
      {
        source: "/:lang(en|de|fr|es|pt-BR|it|ko|ja|zh|zh-hant)/docs/:path*.md",
        destination: "/:lang/docs/:path*",
        permanent: true,
      },
      {
        source:
          "/:lang(en|de|fr|es|pt-BR|it|ko|ja|zh|zh-hant)/:feature(pmc-fitness-chart|power-curve|power-rankings|custom-zones|cp-ftp-lthr-estimator|effective-vo2max-trend|best-efforts|fitness-fatigue-form)",
        destination: "/:lang/features/:feature",
        permanent: true,
      },
      {
        source:
          "/:feature(pmc-fitness-chart|power-curve|power-rankings|custom-zones|cp-ftp-lthr-estimator|effective-vo2max-trend|best-efforts|fitness-fatigue-form)",
        destination: "/features/:feature",
        permanent: true,
      },
      {
        source:
          "/:lang(en|de|fr|es|pt-BR|it|ko|ja|zh|zh-hant)/docs/metrics/:group(pmc|physiology|pace|heart-rate)",
        destination: "/:lang/docs/metrics",
        permanent: true,
      },
      {
        source: "/docs/metrics/:group(pmc|physiology|pace|heart-rate)",
        destination: "/docs/metrics",
        permanent: true,
      },
    ];
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
};

const nextConfig = withNextIntl(withMDX(config));

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: process.env.SENTRY_ORG,

  project: process.env.SENTRY_PROJECT,
  // Upload source maps for readable stack traces
  authToken: sentryAuthToken,
  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Keep source-map upload scoped to the default set. Widening it materially
  // increases build time and peak memory on the self-hosted runner.
  widenClientFileUpload: false,

  // The production Docker build does not receive an upload token. Generating
  // Turbopack source maps without being able to upload them only increases
  // memory and image-build time. Builds with an explicit token keep them.
  sourcemaps: {
    disable: !sentryAuthToken,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: telemetryEnabled ? "/monitoring" : undefined,

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: telemetryEnabled,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
