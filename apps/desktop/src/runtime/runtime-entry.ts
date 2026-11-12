import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertCoreResources,
  readCoreSource,
  resolveCoreMigrationRunner,
} from "./core-source.mjs";

async function firstExisting(
  candidates: string[],
  code: string,
): Promise<string> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported internal build layout.
    }
  }
  const error = new Error(
    `Desktop runtime entry is missing: ${candidates.join(", ")}`,
  );
  Object.assign(error, { code });
  throw error;
}

export async function resolveDesktopRuntimeEntries(
  desktopDirectory: string,
  packagedAppRoot?: string,
) {
  if (packagedAppRoot) {
    // Installed apps must be self-contained; never fall back to a developer's
    // workspace or an environment-provided entrypoint.
    return {
      databaseRunner: resolveCoreMigrationRunner(
        resolve(packagedAppRoot, "node_modules/@trainingloadai/database"),
      ),
      server: await firstExisting(
        [
          resolve(
            packagedAppRoot,
            "runtime/server/dist/apps/server/src/main.self-host.js",
          ),
        ],
        "DESKTOP_SERVER_ENTRY_MISSING",
      ),
      client: await firstExisting(
        [
          resolve(packagedAppRoot, "runtime/client/apps/client/server.js"),
          resolve(packagedAppRoot, "runtime/client/server.js"),
        ],
        "DESKTOP_CLIENT_ENTRY_MISSING",
      ),
    };
  }
  const source = readCoreSource(desktopDirectory, { requireBuild: true });
  assertCoreResources(
    source,
    resolve(desktopDirectory, "dist/core-source.json"),
  );
  const clientRoot = resolve(source.directory, "apps/client/.next/standalone");
  const client = await firstExisting(
    [
      resolve(clientRoot, "apps/client/server.js"),
      resolve(clientRoot, "server.js"),
    ],
    "DESKTOP_CLIENT_ENTRY_MISSING",
  );
  const manifest = JSON.parse(
    await readFile(resolve(client, "../package.json"), "utf8"),
  );
  if (manifest.version !== source.version)
    throw Object.assign(
      new Error(
        "Selected Core standalone build has a different version. Rebuild the selected Core.",
      ),
      { code: "DESKTOP_CORE_BUILD_MISMATCH" },
    );
  return {
    databaseRunner: resolveCoreMigrationRunner(
      resolve(source.directory, "packages/prisma"),
    ),
    server: await firstExisting(
      [
        resolve(
          source.directory,
          "apps/server/dist-selfhost/apps/server/src/main.self-host.js",
        ),
      ],
      "DESKTOP_SERVER_ENTRY_MISSING",
    ),
    client,
  };
}
