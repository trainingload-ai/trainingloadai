import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { loadEnvConfig } from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "./package.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../..");
const nextBuildCpus = Number.parseInt(process.env.NEXT_BUILD_CPUS ?? "", 10);

// 从 monorepo 根目录加载 .env*（与在 apps/client/ 下放 .env 效果一致）
// - 第二个参数必须与运行模式一致：dev 用 .env.development / .env；build 用 .env.production / .env
//   若省略，@next/env 会按「非 dev」处理，容易误以为「根目录 .env 没生效」
// - 第四个参数 forceReload：避免 Next 在其它时机已缓存过 loadEnvConfig，导致本次根目录加载被跳过
const isDev = process.env.NODE_ENV !== "production";
loadEnvConfig(workspaceRoot, isDev, console, true);
const isCoachE2e =
  process.env.NODE_ENV === "development" && process.env.COACH_E2E === "1";
const isSelfHostBuild = Boolean(process.env.NEXT_PUBLIC_SELF_HOST_MODE?.trim());
const deploymentAuthClientPluginsPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/auth-client-plugins.ts")
  : resolve(
      workspaceRoot,
      "packages/managed-client/src/auth-client-plugins.ts",
    );
const deploymentManagedUiPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/managed-ui.tsx")
  : resolve(workspaceRoot, "packages/managed-client/src/managed-ui.ts");
const deploymentManagedMessagesPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/managed-messages.ts")
  : resolve(workspaceRoot, "packages/managed-client/src/managed-messages.ts");
const deploymentAnalyticsPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/analytics.ts")
  : resolve(workspaceRoot, "packages/managed-client/src/analytics.ts");
const deploymentProviderCatalogPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/provider-catalog.ts")
  : resolve(workspaceRoot, "packages/managed-client/src/provider-catalog.ts");
const managedClientPath = resolve(workspaceRoot, "packages/managed-client/src");
const managedSharedPath = resolve(workspaceRoot, "packages/managed-shared/src");
const deploymentProviderPresentationPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/provider-presentation.ts")
  : resolve(
      workspaceRoot,
      "packages/managed-client/src/provider-presentation.ts",
    );
const deploymentRoutePolicyPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/route-policy.ts")
  : resolve(workspaceRoot, "packages/managed-client/src/route-policy.ts");
const deploymentRegistrationAttributionPath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/registration-attribution.ts")
  : resolve(
      workspaceRoot,
      "packages/managed-client/src/registration-attribution.ts",
    );
const deploymentMapEnginePath = isSelfHostBuild
  ? resolve(__dirname, "src/deployment/map-engine.ts")
  : resolve(workspaceRoot, "packages/managed-client/src/map-engine.ts");

function parseHostnameFromUrl(raw?: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

const imageHostnames = Array.from(
  new Set(
    [
      ...(isSelfHostBuild
        ? []
        : [
            "thumbs.trainingload.ai",
            "thumbs-dev.trainingload.ai",
            "assets.trainingload.ai",
            "dev.trainingload.ai",
            "appleid.cdn-apple.com",
          ]),
      parseHostnameFromUrl(process.env.ACTIVITY_MAP_THUMB_PUBLIC_BASE_URL),
    ].filter((v): v is string => Boolean(v)),
  ),
);

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  // Self-host keeps durable response data on disk; do not reserve Next's
  // default in-process cache in every local instance.
  cacheMaxMemorySize: isSelfHostBuild ? 0 : undefined,
  // Docker 运行时只需要文件追踪生成的最小 standalone 目录。
  // monorepo 依赖位于 client 上级，因此追踪根目录必须指向 workspace 根。
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    // Dynamic locale imports are bundled today; keep the source dictionaries
    // and shared runtime modules as an explicit monorepo deployment contract.
    "/*": [
      "../../packages/messages/client-core/**/*.json",
      ...(isSelfHostBuild
        ? []
        : ["../../packages/managed-client/.generated/messages/client/**/*.json"]),
      "../../packages/shared/**/*",
    ],
  },
  // Separate ports do not isolate Next's files: the screenshot server must not
  // overwrite the live dev server's manifests, chunks or generated route types.
  distDir: isCoachE2e
    ? ".next-coach-e2e"
    : process.env.NODE_ENV === "development"
      ? ".next-dev"
      : ".next",
  typescript: {
    tsconfigPath: isCoachE2e
      ? "tsconfig.coach-e2e.json"
      : isSelfHostBuild
        ? "tsconfig.selfhost.json"
        : "tsconfig.json",
  },
  experimental: {
    externalDir: true,
    // Self-host/runtime images do not ship server source maps. Keep this
    // explicit so a Next.js default change cannot make private source easier
    // to recover from the standalone artifact.
    serverSourceMaps: false,
    // Bound worker fan-out for memory-constrained production Docker builds.
    // Local builds retain Next.js defaults when NEXT_BUILD_CPUS is absent.
    cpus:
      Number.isSafeInteger(nextBuildCpus) && nextBuildCpus > 0
        ? nextBuildCpus
        : undefined,
  },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@deployment/auth-client-plugins": deploymentAuthClientPluginsPath,
      "@deployment/managed-ui": deploymentManagedUiPath,
      "@deployment/managed-messages": deploymentManagedMessagesPath,
      "@deployment/analytics": deploymentAnalyticsPath,
      "@deployment/provider-catalog": deploymentProviderCatalogPath,
      "@deployment/provider-presentation": deploymentProviderPresentationPath,
      "@deployment/route-policy": deploymentRoutePolicyPath,
      "@deployment/registration-attribution":
        deploymentRegistrationAttributionPath,
      "@deployment/map-engine": deploymentMapEnginePath,
      "@managed-client": managedClientPath,
      "@managed-shared": managedSharedPath,
    };
    if (!isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "@ai-sdk/mcp/mcp-stdio": false,
      };
    }

    return config;
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_AI_TODAY_WEATHER_ENABLED:
      process.env.AI_TODAY_WEATHER_ENABLED === "true" ? "true" : "false",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: imageHostnames.map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
