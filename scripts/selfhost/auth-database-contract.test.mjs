import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("the Prisma JWKS model covers every Better Auth JWT field", async () => {
  const serverRequire = createRequire(
    resolve(repositoryRoot, "apps/server/package.json"),
  );
  const pluginsPath = serverRequire.resolve("better-auth/plugins");
  const { jwt } = await import(pathToFileURL(pluginsPath).href);
  const plugin = jwt({ jwks: { jwksPath: "/jwks" } });
  const pluginFields = Object.keys(plugin.schema?.jwks?.fields ?? {}).sort();
  const schema = await readFile(
    resolve(repositoryRoot, "packages/prisma/core/schema.prisma"),
    "utf8",
  );
  const model = schema.match(/model jwks \{([\s\S]*?)\n\}/)?.[1];

  assert.ok(model, "Prisma must declare the Better Auth jwks model");
  for (const field of pluginFields) {
    assert.match(
      model,
      new RegExp(`^\\s*${field}\\s+`, "m"),
      `Prisma jwks is missing Better Auth field ${field}`,
    );
  }
});
