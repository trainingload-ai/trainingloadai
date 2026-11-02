# `main` branch protection

Apply this policy when the public GitHub repository is created. GitHub branch protection is server-side configuration; files in the repository cannot enforce it by themselves.

## Required rules

- Target the default branch `main`.
- Require every change to arrive through a pull request.
- Require the `core` and `docs` checks from GitHub Actions to pass before merge, with the pull request branch up to date with `main`.
- Run both required workflows on every pull request targeting `main`, without pull request path filters. A workflow skipped by a path filter leaves its required check pending and blocks merging. Path filters on post-merge `push` events may remain.
- Require zero approving reviews and leave required code-owner and last-push approval disabled, so the sole maintainer can merge their own pull requests after validation. `CODEOWNERS` still requests the maintainer's review on contributions.
- Require all review conversations to be resolved.
- Block force pushes and branch deletion.
- Apply the rules to administrators without bypass.
- Keep write and merge permission limited to `@berber1016`. Contributors work from branches or forks and cannot merge their own pull requests.
- Restrict updates to `main` to `@berber1016`, with no allowed teams, apps, or pull request bypass actors. Keep auto-merge disabled. The maintainer performs the final merge manually; automation and coding agents only prepare and update pull requests.

`CODEOWNERS` requests `@berber1016` on every pull request. Do not grant repository write access merely to let someone contribute; read access and pull requests are sufficient for public contributors.
