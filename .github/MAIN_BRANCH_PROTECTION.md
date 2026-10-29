# `main` branch protection

Apply this policy when the public GitHub repository is created. GitHub branch protection is server-side configuration; files in the repository cannot enforce it by themselves.

## Required rules

- Target the default branch `main`.
- Require every change to arrive through a pull request.
- Require the `core` and `docs` GitHub Actions checks to pass before merge.
- Require all review conversations to be resolved.
- Block force pushes and branch deletion.
- Apply the rules to administrators without bypass.
- Keep write and merge permission limited to `@berber1016`. Contributors work from branches or forks and cannot merge their own pull requests.

`CODEOWNERS` requests `@berber1016` on every pull request. Do not grant repository write access merely to let someone contribute; read access and pull requests are sufficient for public contributors.
