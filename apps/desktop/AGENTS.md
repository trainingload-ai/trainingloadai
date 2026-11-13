# Desktop development

Desktop is part of the Public AGPL repository. Its business server, client, database migrations, messages, and theme assets must come from the same repository checkout. Do not add a separate Core pin, private-workspace path, or independent server/client override.

Run `pnpm desktop:build` when business sources change. Native-only changes need `pnpm --dir apps/desktop build`. Validate with desktop tests, `core:check`, `runtime:prepare`, and the relocated `runtime:smoke`; use temporary profiles/databases and never reset an existing user's data or create an Owner on their behalf.

Preserve product name `Trainingload.ai`, application identifier `ai.trainingload.personal`, data-root conventions, and OS credential namespaces during refactoring. Keep startup UI and native menus aligned with the Client's existing themes and locale system. No credentials, user profiles, downloaded Electron binaries, or generated build output belong in Git.

The repository's PR and maintainer-only merge policy applies here. Local unsigned packages are not signed-release acceptance.
