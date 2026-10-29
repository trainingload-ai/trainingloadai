import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  repositoryRoot,
  validateBuildContextSources,
  validateDockerfile,
  validateDockerignore,
  validateRepository,
} from "./verify-image-contract.mjs";

test("repository image contract is internally consistent", async () => {
  const result = await validateRepository();
  assert.deepEqual(result.errors, []);
  assert.equal(result.releaseVersion, "1.1.16");
});

test("rejects an unpinned base image and root runner", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.server;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const invalid = source
    .replace(result.contract.baseImages.node.reference, "node:22-bookworm-slim")
    .replace("USER 10001:10001", "USER root");
  const codes = validateDockerfile(
    invalid,
    "server",
    definition,
    result.contract,
  ).map((error) => error.code);

  assert.ok(codes.includes("BASE_IMAGE"));
  assert.ok(codes.includes("NON_ROOT"));
});

test("rejects runner files copied without fixed ownership", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.client;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const invalid = source.replace("--chown=10001:10001 ", "");
  const errors = validateDockerfile(
    invalid,
    "client",
    definition,
    result.contract,
  );

  assert.ok(errors.some((error) => error.code === "COPY_OWNER"));
});

test("allows the scratch system rootfs to retain root ownership", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.client;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const errors = validateDockerfile(
    source,
    "client",
    definition,
    result.contract,
  );

  assert.ok(!errors.some((error) => error.code === "COPY_OWNER"));
});

test("rejects a scratch runner without the verified minimal rootfs", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.server;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const invalid = source.replace(
    "COPY --from=builder /app/runtime-rootfs/ /",
    "COPY --from=builder --chown=10001:10001 /app/runtime-rootfs/ /",
  );
  const errors = validateDockerfile(
    invalid,
    "server",
    definition,
    result.contract,
  );

  assert.ok(errors.some((error) => error.code === "RUNTIME_ROOTFS"));
});

test("accepts insignificant whitespace in an exec-form command", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.client;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const compact = source.replace(
    'CMD ["node", "server.js"]',
    'CMD ["node","server.js"]',
  );
  const errors = validateDockerfile(
    compact,
    "client",
    definition,
    result.contract,
  );

  assert.ok(!errors.some((error) => error.code === "ENTRYPOINT"));
});

test("rejects an incorrect OCI license label", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.server;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const invalid = source.replace("AGPL-3.0-only", "MIT");
  const errors = validateDockerfile(
    invalid,
    "server",
    definition,
    result.contract,
  );

  assert.ok(errors.some((error) => error.code === "LICENSE"));
});

test("rejects a Client image that relies on ignored generated design tokens", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.client;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const invalid = source.replace(
    "RUN pnpm --dir ./packages/design-tokens generate\n",
    "",
  );
  const errors = validateDockerfile(
    invalid,
    "client",
    definition,
    result.contract,
  );

  assert.ok(errors.some((error) => error.code === "DESIGN_TOKENS_BUILD"));
});

test("excludes documentation from all runtime image roles", async () => {
  const result = await validateRepository();
  assert.deepEqual(Object.keys(result.contract.images).sort(), ["client", "migrate", "server"]);
});

test("rejects package managers left in the runtime stage", async () => {
  const result = await validateRepository();
  const definition = result.contract.images.server;
  const source = await readFile(
    resolve(repositoryRoot, definition.dockerfile),
    "utf8",
  );
  const invalid = source + "\nCOPY /usr/local/bin/npm /usr/local/bin/npm\n";
  const errors = validateDockerfile(
    invalid,
    "server",
    definition,
    result.contract,
  );

  assert.ok(errors.some((error) => error.code === "RUNTIME_COMMAND"));
});

test("rejects a build context that can include environment files", () => {
  const errors = validateDockerignore(".git\nnode_modules\n", [
    ".git",
    ".env",
    ".env.*",
  ]);
  assert.deepEqual(
    errors.map((error) => error.message),
    ["missing required pattern: .env", "missing required pattern: .env.*"],
  );
});

test("rejects Dockerfile COPY sources missing from the public checkout", async () => {
  const errors = await validateBuildContextSources(
    "COPY missing-public-input/ ./missing-public-input/\n",
    "apps/client/Dockerfile",
  );
  assert.deepEqual(
    errors.map((error) => error.code),
    ["COPY_SOURCE"],
  );
});
