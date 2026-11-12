# Trainingload.ai Personal Desktop

The Electron desktop app is part of this AGPL-3.0-only Public repository. It runs the same Next.js Client, NestJS Server, and database migrations as browser Self-host, with a local PGlite database. Native windows, menus, credentials, backups, startup UI, and packaging are maintained here.

## Build and run

Use Node.js 22+ and pnpm 9+. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm desktop:build
pnpm --dir apps/desktop core:check
pnpm desktop:start
```

`desktop:build` generates this checkout's Prisma Client, builds its Self-host server and Next standalone client, and then builds the Electron code and resources. The first command downloads the official Electron runtime; headless CI can set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` when it does not launch Electron.

For an isolated test profile:

```sh
pnpm desktop:start -- --user-data-dir=/absolute/path/to/test-profile
```

Development, translations, startup theme tokens, server/client entrypoints, and the migration runner all use this repository checkout. There is no external Core checkout, separate version pin, or per-service entry override. Desktop, Client, Server, and database package versions must match the repository version. A business-source fingerprint detects stale builds and generated desktop resources; changes to Client, Server, schema, or shared messages require `pnpm desktop:build` again. Native-only edits need `pnpm --dir apps/desktop build`.

This is the desktop source workflow. It is separate from installing or operating a signed Docker Self-host release bundle; follow the repository Self-host documentation for those instances.

## Package locally

```sh
pnpm --dir apps/desktop test
pnpm --dir apps/desktop runtime:prepare
pnpm --dir apps/desktop runtime:smoke
pnpm --dir apps/desktop pack
pnpm --dir apps/desktop dist:local
# Smaller macOS LZMA DMG; uses the system hdiutil
pnpm --dir apps/desktop dist:mac:dmg
```

Artifacts are written to `apps/desktop/build/release/`. Build on the intended OS and architecture. macOS arm64 has been exercised locally; Windows and Linux installer workflows still need platform acceptance. Local macOS packages are unsigned and unnotarized. Signing credentials belong in release infrastructure, never in this repository.

The production graph is collected explicitly, with the same checkout's migration runner and generated Prisma Client. Runtime pruning retains DuckDB, PGlite, geo-tz's default historical data, and image processing. macOS universal native libraries retain only the intended architecture, identical dependency-free libvips assets are shared, and TypeScript/build-only files are removed. Runtime files remain real files rather than ASAR entries. The runtime budget is 280 MiB, with a separate 290 MiB Linux x64 limit for its larger upstream native libraries (CI baseline: 284.4 MiB). Budgets and the relocated smoke test detect dependency growth or missing files. `runtime-size.json` records version, commit, source fingerprint, and sizes; installed apps use bundled files exclusively.

## Native integration and startup

- The product name is Trainingload.ai and the macOS application identifier is `ai.trainingload.personal`. These identities and the data directory are preserved when moving the source into Public.
- The default data directory is `~/Library/Application Support/Trainingload.ai/user/data`. `--user-data-dir` also isolates the default data root. No login item is registered.
- Closing a macOS window hides it; the Dock reopens it. `Cmd+Q` stops child services and closes the database.
- The application menu's Settings entry (`Cmd+,`) opens the existing product Settings page. Data Storage Location is separate and affects the next launch; existing data is retained without automatic movement.
- The native UI uses this Client's supported locales, locale resolver, `NEXT_LOCALE` preference, and shared navigation/settings translations. Desktop-specific strings are in `messages/`, with the same ten locales and build-time key/parameter validation.
- The startup window uses the Client's desktop theme tokens and loading spinner. The existing next-themes preference is cached locally for startup, with a system-theme default and reduced-motion support. It does not add a second theme setting.
- Startup failures display a stable error code and retain existing data. Browser isolation, sandboxing, loopback-only services, and the private internal API credential stay enabled.

## Existing development-profile credentials

Instance secrets are encrypted in the data root's `credential-vault.json` and validated against the database before reuse. Existing owner identity and signing records are retained. Never reset the database or disable encryption to bypass `DESKTOP_INSTANCE_SECRET_MISMATCH`.

An older source preview can have used Electron's original OS credential namespace. When a one-time migration is needed, launch the installed app with the original trusted runtime:

```sh
env -u ELECTRON_RUN_AS_NODE "/path/to/Trainingload.ai.app/Contents/MacOS/Trainingload.ai" \
  "--legacy-electron=/path/to/original/Electron.app/Contents/MacOS/Electron"
```

The helper transfers existing keys only over private IPC. Matching keys are re-encrypted by the current OS store; original files remain and no plaintext export is produced. Later launches use the normal entrypoint.

## Update and release status

The electron-updater adapter checks only when the packaged release contains a configured `resources/app-update.yml`. It does not automatically download, install on quit, accept prereleases, or downgrade. Installation waits for the local services and database to stop. Development previews never contact an update feed.

Formal distribution still requires signing/notarization, a controlled update feed, clean-machine acceptance, and cross-version upgrade testing with actual signed packages. Source and local packaging do not constitute signed-release acceptance.
