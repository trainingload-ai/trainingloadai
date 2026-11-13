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

Source development uses `Trainingload.ai/development` under the OS application-data directory, with its database under that profile's `data/`. It never reads the release profile's data-directory preference or opens the release database by default. Installed releases retain the existing `Trainingload.ai/user/data` convention. This isolates files without renaming either the release or original Electron OS credential namespace. Older development data is retained in place and is not automatically adopted by the new development profile.

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

Artifacts are written to `apps/desktop/build/release/`. Build on the intended OS and architecture. macOS arm64 has been exercised locally; Windows and Linux installer workflows still need platform acceptance. The local commands above produce unsigned, unnotarized macOS packages. Signing credentials belong in Keychain or release infrastructure, never in this repository.

Unsigned/ad-hoc packaged macOS copies are packaging evidence, not runnable release previews: startup rejects them before opening the release database or requesting its Keychain key. Use `desktop:start` for isolated source development or the Developer ID signed workflow for native acceptance and distribution. This prevents local test packages from taking over the release's credential namespace.

The production graph is collected explicitly, with the same checkout's migration runner and generated Prisma Client. Runtime pruning retains DuckDB, PGlite, geo-tz's default historical data, and image processing. macOS universal native libraries retain only the intended architecture, identical dependency-free libvips assets are shared, and TypeScript/build-only files are removed. Runtime files remain real files rather than ASAR entries. The runtime budget is 280 MiB, with a separate 290 MiB Linux x64 limit for its larger upstream native libraries (CI baseline: 284.4 MiB). Budgets and the relocated smoke test detect dependency growth or missing files. `runtime-size.json` records version, commit, source fingerprint, and sizes; installed apps use bundled files exclusively.

## Signed macOS distribution

The pinned `@electron/osx-sign` 1.3.3 dependency has a pnpm patch that scans entries sequentially. Its upstream recursive parallel scan can exhaust file descriptors on hosted Macs with an unpacked dependency graph. A regression test runs the installed signer against more than 1,500 files with a 64-descriptor limit and checks binary discovery, framework ordering and temporary-file cleanup. Keep the patch until a compatible upstream signer bounds this work.

Install a **Developer ID Application** certificate with its matching private key in the Mac's login Keychain. Apple Development and App Store distribution certificates do not serve this direct-download release workflow. A Developer ID Installer certificate is only needed for a `.pkg`, which this workflow does not produce.

Store notarization authorization locally using `xcrun notarytool store-credentials <profile> --apple-id <account> --team-id <team> --keychain ~/Library/Keychains/login.keychain-db`. Enter the app-specific password only at the secure interactive prompt; never put it in a command argument, shell history, repository, or chat. The account holder completes credential creation and any required agreements. See [Apple's certificate instructions](https://developer.apple.com/help/account/certificates/create-developer-id-certificates) and [notarization documentation](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

```sh
export APPLE_TEAM_ID="YOURTEAMID"
export APPLE_KEYCHAIN_PROFILE="your-local-notary-profile"
# Optional: APPLE_KEYCHAIN for a non-default login Keychain.
# If several valid certificates match, explicitly set the certificate SHA-1:
# export TRAININGLOAD_MAC_SIGNING_IDENTITY="40_HEXADECIMAL_CHARACTERS"
pnpm desktop:build
pnpm --dir apps/desktop signing:mac:check
pnpm --dir apps/desktop test
pnpm --dir apps/desktop dist:mac:signed
```

Preflight requires exactly one valid Developer ID Application identity for the selected team and working notarization authorization. The release command enables Hardened Runtime, signs nested native code and the application, submits the application to Apple, staples and verifies its ticket, creates the compressed LZMA DMG, signs/notarizes/staples that disk image, and creates a ZIP containing the stapled app. It checks signatures and Gatekeeper and computes checksums after stapling. `--publish never` prevents release publication. Final artifacts and `release.json` appear in a new timestamped `apps/desktop/build/release-signed/` directory only after all checks pass; failed staging and notarization IDs are retained for diagnosis. The local unsigned flow remains available separately.

Desktop Core builds disable Next's disk image and ISR caches and keep a bounded 50 MiB in-memory response cache. This prevents changes to sealed application resources during use; normal browser Self-host builds keep their existing disk-cache behavior. Packaging rejects a client built with the ordinary Self-host cache configuration. The relocated smoke test exercises images and routes and checks that no application files changed.

## GitHub-hosted macOS releases

Ticket stapling and validation retry Apple's connection-loss error (`stapler` exit 68 with `NSURLErrorDomain -1005`) up to three attempts, waiting 10 and 20 seconds. Invalid tickets and other errors fail immediately. These retries never re-sign artifacts or submit another notarization request.

`Desktop macOS verification` builds, tests, smoke-tests and packages arm64 on the standard `macos-15` runner for pull requests. It receives no signing secrets. Existing required `core` and `docs` checks remain unchanged.

`Desktop macOS signed release` is manually dispatched from `main`. It builds and tests before importing credentials, then runs the same signed-release command in a temporary runner Keychain. Only in this enforced CI context, the fresh unlocked Keychain is also made the temporary default for native credential acceptance; cleanup restores both the original default and search list before removing it. Local release checks do not change the user's default Keychain. The `desktop-macos-release` GitHub Environment must have a custom deployment branch rule allowing **only `main`**. Configure these five Environment Secrets, not repository-wide secrets:

| Secret                     | Value                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `DESKTOP_MAC_P12_BASE64`   | Base64 of one encrypted Developer ID Application identity, including its private key |
| `DESKTOP_MAC_P12_PASSWORD` | Password protecting that `.p12` export                                               |
| `DESKTOP_MAC_APPLE_ID`     | Apple developer account email                                                        |
| `DESKTOP_MAC_APP_PASSWORD` | App-specific password for notarization                                               |
| `DESKTOP_MAC_TEAM_ID`      | Team identifier from the Developer ID certificate                                    |

The operator exports only the intended Developer ID Application identity from the login Keychain to a password-protected `.p12` **outside all source repositories**. Keep the private key and passwords out of chat. After the reviewed workflow and helpers are merged into `main`, the operator can configure all five Secrets from their own local terminal:

```sh
bash apps/desktop/scripts/configure-macos-cloud.sh /absolute/path/to/identity.p12 trainingload-ai/trainingloadai
```

This helper checks the public repository, administrator permissions, server-enforced main-only Environment policy and merged workflow before collecting credentials. Password prompts are hidden; credentials go to `gh secret set` through stdin and are encrypted by GitHub CLI. The operator confirms the exact destination before upload. The exported file remains under the operator's control.

In GitHub Actions, choose **Desktop macOS signed release → Run workflow → main**. Successful notarized DMG/ZIP installers, checksums and verification reports are uploaded to a **draft** GitHub Release named `desktop-v<version>`. Existing releases are never overwritten and publication remains a maintainer action. Native installers are not stored as Actions artifacts; only small JSON evidence reports are retained there for one day. Standard hosted macOS compute is free for public repositories; avoid larger runners and monitor independent storage quotas. Certificates are removed and the runner Keychain search list restored in an always-run cleanup step.

Apple submissions are recorded before waiting for a result, so failed or timed-out jobs retain their notarization IDs in the evidence artifact. The workflow does not automatically resubmit queued requests. Cloud builds do not depend on the maintainer's Mac remaining online. This initial workflow produces macOS arm64; Intel and Windows remain separate platform work.

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

An absent vault/value must not access OS secure storage. A new database does not search for credentials in legacy profiles, and an already matching primary vault does not invoke a legacy runtime. The release never tries to decrypt the generic Electron profile with the release's OS key. Denied/unavailable secure storage is reported separately from a readable key that does not match the database; restart/reinstall is not presented as a repair for a credential mismatch.

An older source preview can have used Electron's original OS credential namespace. When a one-time migration is needed, launch the installed app with the original trusted runtime:

```sh
env -u ELECTRON_RUN_AS_NODE "/path/to/Trainingload.ai.app/Contents/MacOS/Trainingload.ai" \
  "--legacy-electron=/path/to/original/Electron.app/Contents/MacOS/Electron"
```

The helper transfers existing keys only over private IPC. Matching keys are re-encrypted by the current OS store; original files remain and no plaintext export is produced. Later launches use the normal entrypoint.

## Update and release status

The electron-updater adapter checks only when the packaged release contains a configured `resources/app-update.yml`. It does not automatically download, install on quit, accept prereleases, or downgrade. Installation waits for the local services and database to stop. Development previews never contact an update feed.

Use the signed macOS workflow for direct distribution. Before notarization, it launches the actual signed executable in a new temporary profile to create and reopen a synthetic encrypted credential, then checks relocation and a newly signed copy with a changed bundle build version and the same designated requirement. No database, Owner or normal user profile is opened. Native operations have a 30-second timeout: an interactive Keychain prompt fails acceptance instead of waiting for a person. The release report contains only pass/fail check names; no keys or native logs are exported.

A controlled update feed, clean-machine GUI acceptance, and business-data upgrades across actual released versions remain separate release work. The signed credential check covers OS key access, not those broader workflows. Source and unsigned local packaging do not constitute signed-release acceptance.

macOS may still require explicit authorization when migrating a key created by an unsigned/differently signed application, or when the login Keychain is locked. Signing a new release cannot retroactively grant access to the old item's ACL. Do not delete the Keychain item, reset local identity, store keys as plaintext, or allow all applications to bypass this protection. A fresh `--user-data-dir` isolates files but does **not** create a fresh OS Keychain; clean-install acceptance needs a fresh macOS user/runner.
