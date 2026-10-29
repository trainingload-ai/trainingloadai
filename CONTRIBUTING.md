# Contributing to Trainingload.ai

Thank you for improving the public Trainingload.ai core. Contributions can cover activity processing, training metrics, plans, calendar, AI coaching, self-host operations, documentation, localization, and accessibility.

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use the Bug report, Feature request, or Self-host support form that matches the problem. Use Discussions for questions and early ideas.
- Use an issue first for a large architectural change, schema change, or behavior that affects the self-host lifecycle.
- Keep public code independent of Managed Cloud. Do not add billing, memberships, AI credits, commercial operations, private provider implementations, production credentials, or real athlete data.
- Preserve the strict single-owner self-host model unless the maintainers have accepted a proposal to change the product boundary.
- Use declared package exports; do not introduce cross-package deep imports.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing deployment composition, runtime capabilities, package exports, Prisma ownership, or message composition.

## Local setup

Use Node.js 22 and pnpm 9:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm prisma:generate
```

Run the checks relevant to your change. The complete public baseline is:

```bash
pnpm boundary:check
pnpm messages:check
pnpm selfhost:inventory:check
pnpm selfhost:docs-contract
pnpm build:selfhost
pnpm test:selfhost
pnpm docs:build
```

Documentation-only changes usually need the documentation build and link checks. A focused code change should run its package tests first, then the public boundary and build checks that cover the changed behavior.

README product screenshots must come from the current Self-host Client and deterministic fixture data. Do not use real athlete data or Managed Cloud commercial screens. Regenerate them with:

```bash
pnpm screenshots:readme
```

## Pull requests

A reviewable pull request should:

1. explain the concrete problem and resulting behavior;
2. keep unrelated formatting or refactors out of the diff;
3. include tests when behavior, migration, security, or lifecycle logic changes;
4. update user-facing documentation and messages when the interface changes;
5. state the commands used for validation;
6. contain no secrets, private Cloud code, generated caches, production data, or athlete records.

Schema changes must preserve the separate public migration lineage. Never rewrite an applied migration. Changes to Compose, images, installers, backup, restore, upgrade, or release evidence must also update and pass the corresponding machine-readable contract checks.

The `main` branch is maintained through pull requests. Repository ownership and merge access stay with the project owner; contributors do not receive direct push or merge access. Husky runs the public boundary, message, documentation, and staged-diff checks before each local commit. GitHub Actions runs the complete validation suite again for every pull request.

## Localization

English is the fallback catalog. Do not delete existing translations or add keys to only one locale without updating the message baseline. Keep product terms consistent with adjacent screens and existing documentation.

## License

Public contributions are accepted under `AGPL-3.0-only`. By submitting a contribution, you confirm that you have the right to license it under that license.

A contribution may be used under a separate commercial license only when the contributor and copyright holder have made a separate written agreement. Ordinary contribution under AGPL does not grant that additional permission.
