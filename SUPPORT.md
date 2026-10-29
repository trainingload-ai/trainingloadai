# Support

## Product and self-host questions

Start with the documentation that matches the problem:

- installation and configuration: [SELF_HOSTING.md](SELF_HOSTING.md);
- health checks, logs, and incident handling: [SELF_HOST_OPERATIONS.md](SELF_HOST_OPERATIONS.md);
- supported topology and product limits: [SELF_HOST_KNOWN_LIMITATIONS.md](SELF_HOST_KNOWN_LIMITATIONS.md);
- backups and recovery: [BACKUP_RESTORE.md](BACKUP_RESTORE.md);
- upgrades and rollback: [UPGRADE.md](UPGRADE.md).

If the documentation does not resolve the issue, open a **Self-host support** issue and complete every required field. Include the exact release or commit, platform, self-host mode, stable error code, expected behavior, actual behavior, and minimal reproduction steps.

Before sharing logs or diagnostics:

1. remove `.env.selfhost`, API keys, cookies, bootstrap tokens, private keys, and database dumps;
2. remove names, locations, routes, health information, and other athlete data;
3. inspect the artifact manually even when an automated secret scan passed.

Public issues are searchable and permanent. Use a private channel when safe diagnosis requires sensitive information.

## Bugs and feature requests

Search existing issues before opening a new one. For a bug, describe the smallest reproducible case and the last version where the behavior worked. For a feature request, explain the user problem, the expected outcome, and why it belongs in the public self-host core.

Commercial account, subscription, billing, membership, credit, and Managed Cloud operations are outside this repository's public support scope.

## Security issues

Do not open a public support issue for a vulnerability. Follow the private reporting process in [SECURITY.md](SECURITY.md).
