import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { relative, resolve, sep } from "node:path";
import test from "node:test";
import bundleContract from "../../docker/selfhost/release-bundle-contract.json" with { type: "json" };
import { repositoryRoot } from "./verify-compose-contract.mjs";

function portable(path) {
  return path.split(sep).join("/");
}

test("agent deployment instructions expose one safe release-bundle path", async () => {
  const [agents, selfHosting] = await Promise.all([
    fs.readFile(resolve(repositoryRoot, "AGENTS.md"), "utf8"),
    fs.readFile(resolve(repositoryRoot, "SELF_HOSTING.md"), "utf8"),
  ]);

  for (const required of [
    "签名 release bundle",
    "./install.sh --dry-run --json",
    ".\\install.ps1 --dry-run --json",
    "不得索取、生成、读取或代填 owner 密码/bootstrap token",
    "doctor --json",
    "diagnostics --json",
    "docker compose down -v",
  ]) {
    assert.ok(agents.includes(required), `AGENTS.md is missing: ${required}`);
  }
  for (const required of [
    "./install.sh --dry-run --json",
    ".\\install.ps1 --dry-run --json",
    "checksums.bundle.json",
    "./self-host doctor --json",
    "./self-host backup --output first-verified-backup --json",
  ]) {
    assert.ok(
      selfHosting.includes(required),
      `SELF_HOSTING.md is missing: ${required}`,
    );
  }
  assert.equal(selfHosting.includes("pnpm self-host"), false);
});

test("release bundle contains every relative runtime import and agent contract", async () => {
  const files = new Set(bundleContract.files.map((file) => file.path));
  for (const required of [
    "AGENTS.md",
    "SELF_HOSTING.md",
    "UPGRADE.md",
    "BACKUP_RESTORE.md",
    "install.sh",
    "install.ps1",
    "self-host",
    "self-host.ps1",
    "schemas/self-host-install-result.schema.json",
    "schemas/self-host-instance-config.schema.json",
    "schemas/self-host-cli-result.schema.json",
  ]) {
    assert.equal(files.has(required), true, `bundle omits ${required}`);
  }

  for (const file of [...files].filter((path) => path.endsWith(".mjs"))) {
    const source = await fs.readFile(resolve(repositoryRoot, file), "utf8");
    const imports = [
      ...source.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g),
    ].map((match) => match[1]);
    for (const imported of imports) {
      const target = portable(
        relative(repositoryRoot, resolve(repositoryRoot, file, "..", imported)),
      );
      assert.equal(
        files.has(target),
        true,
        `${file} imports unbundled runtime dependency ${target}`,
      );
    }
  }
});

test("release root wrappers remain thin and delegate to one Node implementation", async () => {
  const [installShell, installPowerShell, cliShell, cliPowerShell] =
    await Promise.all(
      ["install.sh", "install.ps1", "self-host", "self-host.ps1"].map((path) =>
        fs.readFile(resolve(repositoryRoot, path), "utf8"),
      ),
    );
  assert.match(installShell, /scripts\/selfhost\/install\.mjs/);
  assert.match(installPowerShell, /scripts\/selfhost\/install\.mjs/);
  assert.match(cliShell, /scripts\/selfhost\/cli\.mjs/);
  assert.match(cliPowerShell, /scripts\/selfhost\/cli\.mjs/);
  for (const source of [
    installShell,
    installPowerShell,
    cliShell,
    cliPowerShell,
  ]) {
    assert.equal(
      /docker\s+compose|\.env\.selfhost|checksums\.txt/.test(source),
      false,
    );
  }
});
