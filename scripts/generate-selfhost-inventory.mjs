import { promises as fs } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(
  repositoryRoot,
  "docs/self-hosting/inventory",
);
const argumentsList = process.argv.slice(2);
if (
  argumentsList.some((argument) => argument !== "--check") ||
  argumentsList.filter((argument) => argument === "--check").length > 1
) {
  process.stderr.write("Usage: generate-selfhost-inventory.mjs [--check]\n");
  process.exit(2);
}
const checkOnly = argumentsList.includes("--check");
const scanRoots = [
  "apps/server/src",
  "apps/client/src",
  "apps/docs/src",
  "packages/prisma/core",
  "scripts/selfhost",
];
const rootFiles = [
  ".env.example",
  "compose.yml",
  "compose.build.yml",
  "apps/server/Dockerfile",
  "apps/server/tsconfig.selfhost.json",
  "apps/client/Dockerfile",
  "apps/client/next.config.ts",
  "apps/docs/Dockerfile",
  "apps/docs/next.config.mjs",
  "apps/docs/security-headers.mjs",
  "apps/docs/sentry.edge.config.ts",
  "apps/docs/sentry.server.config.ts",
];
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".yml",
  ".yaml",
  ".prisma",
  ".sh",
]);

function isRuntimeFile(relativePath) {
  return (
    relativePath !== "apps/server/src/main.ts" &&
    !relativePath.includes("/node_modules/") &&
    !relativePath.includes("/dist/") &&
    !relativePath.includes("/.next/") &&
    !relativePath.includes("/spec/") &&
    !relativePath.includes("/test/") &&
    !/\.(spec|test)\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

async function walk(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(relativePath)));
    } else if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name)) &&
      isRuntimeFile(relativePath)
    ) {
      files.push(relativePath);
    }
  }
  return files;
}

function capabilityFor(name) {
  const rules = [
    [/^(DATABASE|POSTGRES)_/, "database"],
    [
      /^(STORAGE_|LOCAL_STORAGE_|CLOUDFLARE_|PUBLIC_ASSET_|ACCOUNT_DELETION_STORAGE_)/,
      "storage",
    ],
    [/^(MAP|NEXT_PUBLIC_MAP|NEXT_PUBLIC_TIAN|ACTIVITY_MAP_THUMB)/, "maps"],
    [/^ELEVATION_/, "elevation"],
    [
      /^(WEATHER|WEATHERKIT|ACTIVITY_WEATHER|AI_TODAY_WEATHER|NEXT_PUBLIC_AI_TODAY_WEATHER|APPLE_WEATHERKIT|HEFENG|HEFENT)_/,
      "weather",
    ],
    [/^(MAIL_|SMS_|ADMIN_DAILY_USER_STATS_|ADMIN_REPORT_)/, "mail"],
    [
      /^(AI_|ACTIVITY_AI_|USER_POST_PROCESS_AI_|OPENAI_|OPENROUTER_|DEEPSEEK_|DASHSCOPE_|ZHIPU_|LANGFUSE_|REVIEW_|PUBLIC_AI_)/,
      "ai",
    ],
    [/^(CREEM_|WAFFO_|REVENUECAT_|APPLE_IAP_|BILLING_)/, "billing"],
    [
      /^(STRAVA_|POLAR_|COROS_|SUUNTO_|WAHOO_|INTERVALS_ICU_|LIFTOSAUR_|SELF_HOST_INTEGRATION_)/,
      "third-party-sync",
    ],
    [
      /^(NEXT_PUBLIC_(?:POSTHOG|SENTRY|GA|TELEMETRY)_|GOOGLE_ANALYTICS_|GOOGLE_TAG_|SENTRY_|OTEL_|TELEMETRY_)/,
      "telemetry",
    ],
    [
      /^(GOOGLE_|GITHUB_|OAUTH_|WEIXIN_|APPLE_|BETTER_AUTH_|AUTH_|JWT_|TRUSTED_ORIGINS|SELF_HOST_AUTH_|NEXT_PUBLIC_AUTH_|NEXT_PUBLIC_ENABLE_APPLE_SIGN_IN|SOCIAL_AUTH_)/,
      "auth",
    ],
    [/^(PUBLIC_DEMO_|NEXT_PUBLIC_DEMO_)/, "public-demo"],
    [/^(MCP_|AI_DOCS_)/, "agent"],
    [
      /_WORKER_|_CRON$|_POLL_|_BATCH_|_LEASE_|_CONCURRENCY|_MAX_ATTEMPTS/,
      "workers",
    ],
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? "core-runtime";
}

function ownerFor(reference) {
  const parts = reference.file.split("/");
  if (["server", "client", "docs"].includes(parts[0]) && parts[1] === "src") {
    return parts.length > 3
      ? `${parts[0]}/${parts.slice(2, 4).join("/")}`
      : `${parts[0]}/${parts[2] ?? "runtime"}`;
  }
  return parts[0];
}

function isSensitiveName(name) {
  if (name.startsWith("NEXT_PUBLIC_") || name === "PUBLIC_ASSET_BASE_URL") {
    return false;
  }
  if (
    /(?:^|_)TOKEN_(?:TTL|LIFETIME|EXPIRY|EXPIRES|TIMEOUT|MAX_AGE|LENGTH)(?:_|$)/.test(
      name,
    )
  ) {
    return false;
  }
  return /(SECRET|PASSWORD|PRIVATE_KEY|API_KEY|TOKEN|PEPPER|CREDENTIAL)/.test(
    name,
  );
}

function modeForCapability(capability, name) {
  if (
    capability === "database" ||
    [
      "BETTER_AUTH_SECRET",
      "SELF_HOST_AUTH_SECRET",
      "SELF_HOST_INTEGRATION_SECRET",
      "NEXT_PUBLIC_AUTH_UI_ENABLED",
      "PORT",
      "NODE_ENV",
    ].includes(name)
  ) {
    return "core-local";
  }
  if (
    [
      "storage",
      "maps",
      "elevation",
      "mail",
      "ai",
      "billing",
      "telemetry",
      "weather",
      "third-party-sync",
    ].includes(capability)
  ) {
    return "optional";
  }
  return "core-or-feature";
}

function extractEnvironmentNames(line, allowTemplateSyntax) {
  const names = new Set();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /\benv\.([A-Z][A-Z0-9_]*)/g,
    /\benv\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  ];
  if (allowTemplateSyntax) {
    patterns.push(/\$\{([A-Z][A-Z0-9_]*)(?=[:}?\-])/g);
  }
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) names.add(match[1]);
  }
  return [...names];
}

function extractUrls(line) {
  return [...line.matchAll(/https?:\/\/[^\s'"`)>,}]+/g)].map((match) =>
    match[0].replace(/[.;]+$/, ""),
  );
}

function persistentKind(file, line) {
  if (/tmpdir\(|mkdtemp|\.tmp\b|staging/i.test(line)) return "ephemeral";
  if (/cache/i.test(line)) return "cache";
  if (/StorageService|storage\.service|user-data-export/i.test(file)) {
    return "authoritative-or-export";
  }
  if (/command\./.test(file)) return "operator-artifact";
  return "runtime-write";
}

function endpointCapability(host, references) {
  const joined = `${host} ${references.map((reference) => reference.file).join(" ")}`;
  const rules = [
    [/mapbox|tile|map-thumb|elevation/i, "maps-and-elevation"],
    [/openai|deepseek|dashscope|openrouter|bigmodel|\/ai\//i, "ai"],
    [
      /strava|polar|coros|suunto|wahoo|intervals|liftosaur/i,
      "third-party-sync",
    ],
    [/creem|waffo|revenuecat|billing/i, "billing"],
    [/cloudflare|r2\.|storage\.service/i, "storage"],
    [/weather/i, "weather"],
    [
      /posthog|sentry|langfuse|telemetry|google-analytics|analytics\.google|googletagmanager|doubleclick/i,
      "telemetry",
    ],
    [/apple|google|github|oauth|better-auth/i, "auth"],
    [/localhost|127\.0\.0\.1|trainingload/i, "product-internal"],
  ];
  return (
    rules.find(([pattern]) => pattern.test(joined))?.[1] ??
    "web-asset-or-tooling"
  );
}

const sourceFiles = (
  await Promise.all(scanRoots.map((root) => walk(root)))
).flat();
const existingRootFiles = [];
for (const file of rootFiles) {
  if (await fs.stat(path.join(repositoryRoot, file)).catch(() => null)) existingRootFiles.push(file);
}
const files = [...new Set([...sourceFiles, ...existingRootFiles])].sort();
const defaults = new Map();
for (const file of [(await fs.stat(path.join(repositoryRoot, ".env.example")).catch(() => null)) ? ".env.example" : ".env.example"]) {
  const envExample = await fs.readFile(path.join(repositoryRoot, file), "utf8");
  for (const line of envExample.split(/\r?\n/)) {
    const match = line.match(/^(?:#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) defaults.set(match[1], match[2]);
  }
}
const selfHostConfigSchema = JSON.parse(
  await fs.readFile(
    path.join(repositoryRoot, "schemas/self-host-config.schema.json"),
    "utf8",
  ),
);
for (const [name, definition] of Object.entries(
  selfHostConfigSchema.properties ?? {},
)) {
  if (!defaults.has(name)) {
    defaults.set(
      name,
      Object.prototype.hasOwnProperty.call(definition, "default")
        ? String(definition.default)
        : null,
    );
  }
}

const environment = new Map();
const endpoints = new Map();
const persistentWrites = [];
const writePattern =
  /\b(writeFile|writeFileSync|createWriteStream|mkdir|mkdirSync|mkdtemp|rename|copyFile|unlink|rm)\s*\(|\bfs\.link\s*\(|\btmpdir\s*\(|\/data\//;

for (const file of files) {
  let content;
  try {
    content = await fs.readFile(path.join(repositoryRoot, file), "utf8");
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const reference = { file, line: index + 1 };
    const allowTemplateSyntax = /\.(ya?ml)$/.test(file);
    for (const name of extractEnvironmentNames(line, allowTemplateSyntax)) {
      const current = environment.get(name) ?? { references: [] };
      current.references.push(reference);
      environment.set(name, current);
    }
    for (const url of extractUrls(line)) {
      let host = "dynamic";
      try {
        host = new URL(url.replace(/\$\{[^}]+\}/g, "placeholder")).host;
      } catch {
        // Keep dynamic when a template cannot be parsed as a URL.
      }
      const key = `${host}\0${url}`;
      const current = endpoints.get(key) ?? { host, url, references: [] };
      current.references.push(reference);
      endpoints.set(key, current);
    }
    if (writePattern.test(line)) {
      persistentWrites.push({
        ...reference,
        owner: ownerFor(reference),
        classification: persistentKind(file, line),
        expression: line.trim().slice(0, 300),
      });
    }
  });
}

for (const name of defaults.keys()) {
  if (!environment.has(name)) environment.set(name, { references: [] });
}

const environmentInventory = [...environment.entries()]
  .map(([name, value]) => {
    const references = value.references.sort(
      (left, right) =>
        left.file.localeCompare(right.file) || left.line - right.line,
    );
    const capability = capabilityFor(name);
    return {
      name,
      capability,
      mode: modeForCapability(capability, name),
      sensitive: isSensitiveName(name),
      documented: defaults.has(name),
      exampleDefault: isSensitiveName(name)
        ? defaults.get(name)
          ? "<redacted-non-empty-example>"
          : ""
        : (defaults.get(name) ?? null),
      owners:
        references.length > 0
          ? [...new Set(references.map(ownerFor))].sort()
          : ["deployment-template"],
      references,
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const endpointInventory = [...endpoints.values()]
  .map((entry) => {
    const references = entry.references.sort(
      (left, right) =>
        left.file.localeCompare(right.file) || left.line - right.line,
    );
    return {
      ...entry,
      capability: endpointCapability(entry.host, references),
      owners: [...new Set(references.map(ownerFor))].sort(),
      references,
    };
  })
  .sort(
    (left, right) =>
      left.host.localeCompare(right.host) || left.url.localeCompare(right.url),
  );

persistentWrites.sort(
  (left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line,
);

const generatedAt = "generated-from-current-worktree";
const payloads = {
  "environment-variables.json": {
    schemaVersion: 1,
    generatedAt,
    entries: environmentInventory,
  },
  "external-endpoints.json": {
    schemaVersion: 1,
    generatedAt,
    entries: endpointInventory,
  },
  "persistent-writes.json": {
    schemaVersion: 1,
    generatedAt,
    entries: persistentWrites,
  },
};

const undocumented = environmentInventory.filter((entry) => !entry.documented);
const summary = `# Self-host inventory summary

此目录由 \`pnpm selfhost:inventory\` 从当前 worktree 的运行时代码生成。JSON 中不读取或写入真实
\`.env\`，文档状态来自根/self-host 环境示例与 self-host 配置 schema，敏感变量的非空示例值会被替换。
分类是 SH0 的初始事实索引；capability owner 仍以
\`capability-matrix.zh.md\` 的人工审阅结论为准。

| Inventory | Entries |
| --- | ---: |
| Environment variables | ${environmentInventory.length} |
| External URL literals | ${endpointInventory.length} |
| Filesystem write sites | ${persistentWrites.length} |
| Runtime variables missing from configuration docs | ${undocumented.length} |

## Undocumented runtime variables

${
  undocumented.length > 0
    ? undocumented
        .map(
          (entry) =>
            `- \`${entry.name}\` — ${entry.owners.join(", ") || "root config"}`,
        )
        .join("\n")
    : "- None."
}

## Regeneration

\`\`\`bash
pnpm selfhost:inventory:check
# When the check reports drift:
pnpm selfhost:inventory
\`\`\`
`;
const expectedFiles = new Map([
  ...Object.entries(payloads).map(([name, payload]) => [
    name,
    `${JSON.stringify(payload, null, 2)}\n`,
  ]),
  ["README.md", summary],
]);

if (checkOnly) {
  const drift = [];
  for (const [name, expected] of expectedFiles) {
    const actual = await fs
      .readFile(path.join(outputDirectory, name), "utf8")
      .catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
    if (actual !== expected) drift.push(name);
  }
  if (drift.length > 0) {
    process.stderr.write(
      `self-host inventory is stale: ${drift.join(", ")}\nRun pnpm selfhost:inventory and commit the generated files.\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `self-host inventory: PASS (${environmentInventory.length} variables, ${endpointInventory.length} URLs, ${persistentWrites.length} write sites)\n`,
    );
  }
} else {
  await fs.mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    [...expectedFiles].map(([name, contents]) =>
      fs.writeFile(path.join(outputDirectory, name), contents, "utf8"),
    ),
  );
  process.stdout.write(
    `${JSON.stringify({
      environmentVariables: environmentInventory.length,
      externalUrls: endpointInventory.length,
      persistentWrites: persistentWrites.length,
      undocumentedVariables: undocumented.length,
      outputDirectory: path.relative(repositoryRoot, outputDirectory),
    })}\n`,
  );
}
