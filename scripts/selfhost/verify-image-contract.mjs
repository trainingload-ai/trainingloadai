import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "../..");

function issue(file, code, message) {
  return { file, code, message };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runnerSection(dockerfile) {
  const matches = [...dockerfile.matchAll(/^FROM\s+.+\s+AS\s+runner\s*$/gim)];
  if (matches.length !== 1) return null;
  return dockerfile.slice(matches[0].index);
}

export function validateContractStructure(contract) {
  const errors = [];
  if (contract.schemaVersion !== 2) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "SCHEMA",
        "schemaVersion must be 2",
      ),
    );
  }
  if (contract.configSchemaVersion !== 1) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "CONFIG_SCHEMA",
        "configSchemaVersion must be 1",
      ),
    );
  }
  if (contract.license !== "AGPL-3.0-only") {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "LICENSE",
        "license must match LICENSE.md: AGPL-3.0-only",
      ),
    );
  }
  if (
    JSON.stringify(contract.platforms) !==
    JSON.stringify(["linux/amd64", "linux/arm64"])
  ) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "PLATFORMS",
        "platforms must be linux/amd64 and linux/arm64",
      ),
    );
  }
  const reference = contract.baseImages?.node?.reference ?? "";
  if (
    !/^node:\d+\.\d+\.\d+-bookworm-slim@sha256:[a-f0-9]{64}$/.test(reference)
  ) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "BASE_IMAGE",
        "node base image must use an exact version and sha256 index digest",
      ),
    );
  }
  const debianReference = contract.baseImages?.debian?.reference ?? "";
  if (!/^debian:bookworm-slim@sha256:[a-f0-9]{64}$/.test(debianReference)) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "BASE_IMAGE",
        "debian base image must use the bookworm-slim tag and sha256 index digest",
      ),
    );
  }
  if (
    !Number.isInteger(contract.runtimeIdentity?.uid) ||
    contract.runtimeIdentity.uid <= 0
  ) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "UID",
        "runtime uid must be a positive integer",
      ),
    );
  }
  if (
    !Number.isInteger(contract.runtimeIdentity?.gid) ||
    contract.runtimeIdentity.gid <= 0
  ) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "GID",
        "runtime gid must be a positive integer",
      ),
    );
  }
  if (
    JSON.stringify(contract.forbiddenRuntimeCommands) !==
    JSON.stringify(["npm", "npx", "pnpm", "corepack", "yarn", "yarnpkg"])
  ) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "RUNTIME_COMMANDS",
        "forbidden runtime commands must cover npm, npx, pnpm, corepack, yarn, and yarnpkg",
      ),
    );
  }
  if (
    !Array.isArray(contract.forbiddenRuntimePackages) ||
    contract.forbiddenRuntimePackages.length === 0 ||
    contract.forbiddenRuntimePackages.some(
      (name) => typeof name !== "string" || name.length === 0,
    )
  ) {
    errors.push(
      issue(
        "docker/selfhost/image-contract.json",
        "RUNTIME_PACKAGES",
        "forbiddenRuntimePackages must contain non-empty package names or prefixes",
      ),
    );
  }
  for (const role of ["migrate", "server", "client"]) {
    const definition = contract.images?.[role];
    if (!definition) {
      errors.push(
        issue(
          "docker/selfhost/image-contract.json",
          "IMAGE_ROLE",
          `missing image role: ${role}`,
        ),
      );
      continue;
    }
    if (
      !["scratch-minimal-rootfs", "node-slim"].includes(
        definition.runtimeLayout,
      )
    ) {
      errors.push(
        issue(
          "docker/selfhost/image-contract.json",
          "RUNTIME_LAYOUT",
          `${role} must declare a supported runtimeLayout`,
        ),
      );
    }
    const expectedBase =
      definition.runtimeLayout === "scratch-minimal-rootfs" ? "debian" : "node";
    if (definition.baseImage !== expectedBase) {
      errors.push(
        issue(
          "docker/selfhost/image-contract.json",
          "RUNTIME_BASE",
          `${role} baseImage must be ${expectedBase}`,
        ),
      );
    }
    if (
      ["client", "server"].includes(role) &&
      (!Number.isInteger(definition.maximumSizeBytes) ||
        definition.maximumSizeBytes <= 0)
    ) {
      errors.push(
        issue(
          "docker/selfhost/image-contract.json",
          "IMAGE_BUDGET",
          `${role} must declare a positive maximumSizeBytes`,
        ),
      );
    }
  }
  return errors;
}

export function validateDockerfile(text, role, definition, contract) {
  const file = definition.dockerfile;
  const errors = [];
  const uid = contract.runtimeIdentity.uid;
  const gid = contract.runtimeIdentity.gid;
  const baseReference = contract.baseImages.node.reference;
  const runtimeLayout = definition.runtimeLayout;
  const scratchRuntime = runtimeLayout === "scratch-minimal-rootfs";
  const runtimeBaseReference =
    contract.baseImages[definition.baseImage]?.reference;
  const runner = runnerSection(text);

  if (!text.includes(`ARG NODE_IMAGE=${baseReference}`)) {
    errors.push(
      issue(
        file,
        "BASE_IMAGE",
        "NODE_IMAGE must match the pinned contract reference",
      ),
    );
  }
  if (!runner) {
    errors.push(
      issue(
        file,
        "RUNNER_STAGE",
        "Dockerfile must contain exactly one final runner stage",
      ),
    );
    return errors;
  }
  const expectedRunner = scratchRuntime
    ? "FROM scratch AS runner"
    : "FROM ${NODE_IMAGE} AS runner";
  if (!new RegExp(`^${escapeRegExp(expectedRunner)}\\s*$`, "m").test(text)) {
    errors.push(
      issue(file, "RUNNER_BASE", `runner must use ${expectedRunner}`),
    );
  }
  if (scratchRuntime) {
    if (
      !text.includes(`ARG DEBIAN_IMAGE=${contract.baseImages.debian.reference}`)
    ) {
      errors.push(
        issue(
          file,
          "BASE_IMAGE",
          "DEBIAN_IMAGE must match the pinned contract reference",
        ),
      );
    }
    if (
      !text.includes("scripts/selfhost/collect-linux-runtime-rootfs.mjs") ||
      !/\bnode\s+scripts\/selfhost\/collect-linux-runtime-rootfs\.mjs\b/m.test(
        text,
      )
    ) {
      errors.push(
        issue(
          file,
          "RUNTIME_ROOTFS",
          "scratch runtime must be assembled by collect-linux-runtime-rootfs.mjs",
        ),
      );
    }
    if (
      !/^COPY\s+--from=\S+\s+\/app\/runtime-rootfs\/\s+\/\s*$/m.test(runner)
    ) {
      errors.push(
        issue(
          file,
          "RUNTIME_ROOTFS",
          "scratch runner must copy the minimal rootfs without changing system ownership",
        ),
      );
    }
    if (/^RUN\s+/m.test(runner)) {
      errors.push(
        issue(
          file,
          "RUNTIME_RUN",
          "scratch runner must not execute RUN commands",
        ),
      );
    }
    if (
      !runner.includes('io.trainingload.selfhost.node.source="${NODE_IMAGE}"')
    ) {
      errors.push(
        issue(
          file,
          "NODE_SOURCE",
          "scratch runner must record its pinned Node build source",
        ),
      );
    }
  }
  if (!new RegExp(`^USER\\s+${uid}:${gid}\\s*$`, "m").test(runner)) {
    errors.push(
      issue(file, "NON_ROOT", `runner must declare USER ${uid}:${gid}`),
    );
  }
  if (!runner.includes("STOPSIGNAL SIGTERM")) {
    errors.push(
      issue(file, "STOPSIGNAL", "runner must declare STOPSIGNAL SIGTERM"),
    );
  }
  for (const command of contract.forbiddenRuntimeCommands ?? []) {
    const commandPath = `/usr/local/bin/${command}`;
    if (!scratchRuntime && !runner.includes(commandPath)) {
      errors.push(
        issue(
          file,
          "RUNTIME_COMMAND",
          `runner must explicitly remove /usr/local/bin/${command}`,
        ),
      );
    }
    if (scratchRuntime && runner.includes(commandPath)) {
      errors.push(
        issue(
          file,
          "RUNTIME_COMMAND",
          `scratch runner must not copy or reference ${commandPath}`,
        ),
      );
    }
  }
  if (
    /^RUN\s+.*\b(?:npm|npx|pnpm|corepack|yarn|yarnpkg)\s+(?:add|enable|install|prepare)\b/im.test(
      runner,
    )
  ) {
    errors.push(
      issue(
        file,
        "RUNTIME_INSTALL",
        "runner must not install or enable package managers",
      ),
    );
  }
  if (
    !new RegExp(
      `^WORKDIR\\s+${escapeRegExp(definition.workdir)}\\s*$`,
      "m",
    ).test(runner)
  ) {
    errors.push(
      issue(file, "WORKDIR", `runner must use WORKDIR ${definition.workdir}`),
    );
  }
  if (
    definition.port !== null &&
    !new RegExp(`^EXPOSE\\s+${definition.port}\\s*$`, "m").test(runner)
  ) {
    errors.push(issue(file, "PORT", `runner must expose ${definition.port}`));
  }
  const commandMatch = runner.match(/^CMD\s+(\[[^\n]+\])\s*$/m);
  let command;
  try {
    command = commandMatch ? JSON.parse(commandMatch[1]) : null;
  } catch {
    command = null;
  }
  if (JSON.stringify(command) !== JSON.stringify(definition.entrypoint)) {
    errors.push(
      issue(
        file,
        "ENTRYPOINT",
        `runner must use exec-form CMD ${JSON.stringify(definition.entrypoint)}`,
      ),
    );
  }
  for (const label of contract.requiredLabels) {
    if (!runner.includes(`${label}=`)) {
      errors.push(issue(file, "OCI_LABEL", `runner is missing ${label}`));
    }
  }
  if (
    !runner.includes(`org.opencontainers.image.licenses="${contract.license}"`)
  ) {
    errors.push(
      issue(
        file,
        "LICENSE",
        `runner license label must be ${contract.license}`,
      ),
    );
  }
  const runtimeBaseArgument =
    definition.baseImage === "debian" ? "DEBIAN_IMAGE" : "NODE_IMAGE";
  if (
    !runtimeBaseReference ||
    !runner.includes(
      `org.opencontainers.image.base.name="\${${runtimeBaseArgument}}"`,
    )
  ) {
    errors.push(
      issue(
        file,
        "RUNTIME_BASE_LABEL",
        `runner base label must identify ${definition.baseImage}`,
      ),
    );
  }
  if (!runner.includes(`io.trainingload.selfhost.image-role="${role}"`)) {
    errors.push(
      issue(file, "IMAGE_ROLE", `runner label must identify role ${role}`),
    );
  }
  for (const line of runner.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!/^COPY\s+/i.test(normalized)) continue;
    const isRootfsCopy =
      /^COPY\s+--from=\S+\s+\/app\/runtime-rootfs\/\s+\/\s*$/i.test(normalized);
    if (!isRootfsCopy && !line.includes(`--chown=${uid}:${gid}`)) {
      errors.push(
        issue(
          file,
          "COPY_OWNER",
          `runner application copy must use --chown=${uid}:${gid}: ${normalized}`,
        ),
      );
    }
  }
  if (/^\s*ADD\s+/im.test(text)) {
    errors.push(issue(file, "ADD", "ADD is forbidden; use explicit COPY"));
  }
  if (/^\s*COPY\s+\.\s+/im.test(text)) {
    errors.push(
      issue(
        file,
        "COPY_CONTEXT",
        "COPY . is forbidden; copy allowlisted inputs",
      ),
    );
  }
  if (role === "client") {
    const tokenBuild = "RUN pnpm --dir ./packages/design-tokens generate";
    const clientBuild = "RUN pnpm --dir ./apps/client build:selfhost";
    if (
      !text.includes(
        "COPY packages/design-tokens/package.json ./packages/design-tokens/package.json",
      ) ||
      !text.includes("COPY packages/design-tokens/ ./packages/design-tokens/") ||
      !text.includes(tokenBuild) ||
      text.indexOf(tokenBuild) > text.indexOf(clientBuild)
    ) {
      errors.push(
        issue(
          file,
          "DESIGN_TOKENS_BUILD",
          "client image must stage and generate design tokens before the Client build",
        ),
      );
    }
  }
  if (/\bFROM\s+[^\s]+:latest\b/i.test(text)) {
    errors.push(issue(file, "LATEST", "latest base images are forbidden"));
  }
  for (const secretName of [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "MAPBOX_ACCESS_TOKEN",
    "MAIL_PASSWORD",
    "CLOUDFLARE_SECRET_ACCESS_KEY",
  ]) {
    if (new RegExp(`^(ARG|ENV)\\s+${secretName}(=|\\s)`, "m").test(text)) {
      errors.push(
        issue(
          file,
          "BUILD_SECRET",
          `${secretName} must not be a Docker build ARG or ENV`,
        ),
      );
    }
  }
  if (role === "docs") {
    const heapMatch = text.match(
      /^ARG\s+NEXT_BUILD_MAX_OLD_SPACE_MB=(\d+)\s*$/m,
    );
    if (!heapMatch || Number(heapMatch[1]) < 3072) {
      errors.push(
        issue(
          file,
          "DOCS_BUILD_HEAP",
          "docs build heap must default to at least 3072 MB",
        ),
      );
    }
    if (!/^RUN\s+pnpm --filter \.\/apps\/docs run build\s*$/m.test(text)) {
      errors.push(
        issue(
          file,
          "DOCS_BUILD_COMMAND",
          "docs image must use the contracted docs build script",
        ),
      );
    }
  }
  return errors;
}

export function validateDocsBuildScript(packageFile, packageJson) {
  const build = packageJson.scripts?.build ?? "";
  return /(?:^|&&\s*)next build --webpack(?:\s|$)/.test(build)
    ? []
    : [
        issue(
          packageFile,
          "DOCS_BUILD_BUNDLER",
          "docs production build must select webpack explicitly",
        ),
      ];
}

export function validateDockerignore(text, requiredPatterns) {
  const lines = new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  return requiredPatterns
    .filter((pattern) => !lines.has(pattern))
    .map((pattern) =>
      issue(
        ".dockerignore",
        "DOCKERIGNORE",
        `missing required pattern: ${pattern}`,
      ),
    );
}

export async function validateBuildContextSources(
  text,
  dockerfile,
  root = repositoryRoot,
) {
  const errors = [];
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!/^COPY\s+/i.test(normalized) || /\s--from(?:=|\s)/i.test(normalized)) {
      continue;
    }
    const tokens = normalized.split(/\s+/).slice(1);
    while (tokens[0]?.startsWith("--")) tokens.shift();
    for (const source of tokens.slice(0, -1)) {
      if (source.startsWith("/") || source.includes("$")) continue;
      try {
        await access(resolve(root, source.replace(/\/$/, "")));
      } catch {
        errors.push(
          issue(
            dockerfile,
            "COPY_SOURCE",
            `build-context source does not exist: ${source}`,
          ),
        );
      }
    }
  }
  return errors;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function validateRepository(root = repositoryRoot) {
  const contractPath = resolve(root, "docker/selfhost/image-contract.json");
  const contract = await readJson(contractPath);
  const errors = validateContractStructure(contract);
  const rootPackage = await readJson(resolve(root, "package.json"));

  for (const [role, definition] of Object.entries(contract.images ?? {})) {
    const dockerfile = await readFile(
      resolve(root, definition.dockerfile),
      "utf8",
    );
    errors.push(...validateDockerfile(dockerfile, role, definition, contract));
    errors.push(
      ...(await validateBuildContextSources(
        dockerfile,
        definition.dockerfile,
        root,
      )),
    );
    const imagePackage = await readJson(resolve(root, definition.packageFile));
    if (role === "docs") {
      errors.push(
        ...validateDocsBuildScript(definition.packageFile, imagePackage),
      );
    }
    if (imagePackage.version !== rootPackage.version) {
      errors.push(
        issue(
          definition.packageFile,
          "VERSION",
          `package version ${imagePackage.version} does not match release version ${rootPackage.version}`,
        ),
      );
    }
  }

  const dockerignore = await readFile(resolve(root, ".dockerignore"), "utf8");
  errors.push(
    ...validateDockerignore(
      dockerignore,
      contract.requiredDockerignorePatterns,
    ),
  );
  return { contract, releaseVersion: rootPackage.version, errors };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await validateRepository();
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2)}\n`,
    );
  } else if (result.errors.length === 0) {
    process.stdout.write(
      `self-host image contract: PASS (${Object.keys(result.contract.images).length} images, ${result.contract.platforms.join(", ")})\n`,
    );
  } else {
    for (const error of result.errors) {
      process.stderr.write(`${error.file}: ${error.code}: ${error.message}\n`);
    }
  }
  if (result.errors.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
