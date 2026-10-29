import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const schemaPath = resolve(
  repositoryRoot,
  "packages/prisma/core/schema.prisma",
);
const migrationRoot = resolve(
  repositoryRoot,
  "packages/prisma/core/migrations/0001_core_baseline",
);
const migrationPath = resolve(migrationRoot, "migration.sql");
const manifestPath = resolve(
  repositoryRoot,
  "packages/prisma/core/migrations/manifest.json",
);

if (!process.argv.includes("--force")) {
  process.stderr.write(
    "Refusing to replace the Core baseline without --force. A released baseline is immutable.\n",
  );
  process.exit(2);
}

const diff = spawnSync(
  "pnpm",
  [
    "--dir",
    "packages/prisma",
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "core/schema.prisma",
    "--script",
  ],
  { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

if (diff.status !== 0 || !diff.stdout?.trim()) {
  process.stderr.write(diff.stderr || "Core baseline generation failed.\n");
  process.exit(diff.status || 1);
}

await mkdir(migrationRoot, { recursive: true });
await writeFile(
  migrationPath,
  diff.stdout.endsWith("\n") ? diff.stdout : `${diff.stdout}\n`,
);
const sql = await readFile(migrationPath);
const checksum = createHash("sha256").update(sql).digest("hex");
const schemaChecksum = createHash("sha256")
  .update(await readFile(schemaPath))
  .digest("hex");
const previousManifest = JSON.parse(
  await readFile(manifestPath, "utf8").catch(() => '{"migrations":[]}'),
);
const tailMigrations = [];
for (const entry of previousManifest.migrations ?? []) {
  if (entry.id === "0001_core_baseline") continue;
  const contents = await readFile(resolve(dirname(manifestPath), entry.file));
  tailMigrations.push({
    ...entry,
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      schemaChecksum,
      migrations: [
        {
          id: "0001_core_baseline",
          file: "0001_core_baseline/migration.sql",
          sha256: checksum,
        },
        ...tailMigrations,
      ],
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(
  `Generated Core baseline (${sql.length} bytes, sha256=${checksum}).\n`,
);
