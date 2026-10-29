# Security Policy

## Reporting a vulnerability

Do not report vulnerabilities, exploitation details, credentials, access tokens, database dumps, or athlete data in a public issue or discussion.

Use GitHub's private **Report a vulnerability** flow for this repository. If private vulnerability reporting is unavailable, contact the project maintainer through a private channel before sharing technical details. A useful report includes:

- the affected release or commit;
- the self-host mode and operating environment;
- the security impact and required preconditions;
- minimal reproduction steps or a proof of concept;
- suggested remediation, when available.

Redact secrets and personal training data from screenshots, logs, diagnostics, and archives. Automated redaction reduces accidental exposure but does not make an artifact anonymous; inspect every artifact manually before sharing it.

## Supported versions

Security fixes target supported signed releases. The current public repository is preparing its first signed self-host release, so source snapshots do not yet have a production support window. Once releases are published, supported versions and upgrade paths will be declared in release metadata and [UPGRADE.md](UPGRADE.md).

## Self-host security boundary

The default self-host topology binds the Client to loopback and keeps Server and PostgreSQL on the private Compose network. It has one local Owner and no public signup. Exposing an instance to a LAN or the internet requires an operator-managed authenticated HTTPS reverse proxy, host hardening, backups, updates, and access controls.

Keep `.env.selfhost`, instance secrets, the PostgreSQL data directory, uploaded activity files, backups, diagnostics, and operation records private. Do not bypass signed release verification, migration guards, data-root checks, or lifecycle locks.

See [SELF_HOSTING.md](SELF_HOSTING.md), [SELF_HOST_OPERATIONS.md](SELF_HOST_OPERATIONS.md), and [SELF_HOST_KNOWN_LIMITATIONS.md](SELF_HOST_KNOWN_LIMITATIONS.md) for the supported deployment boundary.
