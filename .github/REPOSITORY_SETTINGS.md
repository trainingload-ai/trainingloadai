# GitHub repository settings

Repository files cover code review, CI, issue intake, dependency updates, and contributor guidance. The following controls must also be enabled in GitHub after the public repository is created.

## Repository profile

- Description: `Open-source, self-hosted endurance training analysis and AI coaching platform.`
- Website: `https://trainingload.ai`
- Topics: `self-hosted`, `training-analysis`, `running`, `cycling`, `training-load`, `ai-coach`, `docker-compose`, `nestjs`, `nextjs`, `postgresql`.
- Upload a dedicated `1280 × 640` social preview derived from the current Self-host interface. Do not use a Managed Cloud screenshot or real athlete data.

## Access and merging

- Keep repository write and merge access limited to `@Buerber`.
- Accept external contributions through forks and pull requests without granting write access.
- Set `main` as the default branch and apply [the main branch protection policy](MAIN_BRANCH_PROTECTION.md).
- Allow squash merge, automatically delete merged branches, and keep auto-merge disabled unless the maintainer explicitly enables it for a reviewed pull request.

## Community

- Enable Issues and Discussions.
- Use Discussions for questions, ideas, and general product conversation.
- Use Issue Forms for reproducible bugs, Self-host support, and concrete feature proposals.

## Security

- Enable private vulnerability reporting.
- Enable the dependency graph, Dependabot alerts, and Dependabot security updates.
- Enable secret scanning and push protection when available for the repository.
- Enable GitHub code scanning using default setup after the repository language index is ready.
- Keep the default GitHub Actions token read-only; grant `packages: write` and `id-token: write` only inside release jobs that need them.

## Releases

- Publish releases only from protected version tags after the signed image and release-bundle workflows pass.
- Keep release assets immutable and retain the checksum, signature bundle, provenance, SBOM, source revision, and image digests for each release.
- Do not publish floating image tags as the only installation reference.
