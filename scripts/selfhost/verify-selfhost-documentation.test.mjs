import assert from "node:assert/strict";
import { test } from "node:test";
import documentationContract from "../../docker/selfhost/documentation-contract.json" with { type: "json" };
import { promises as fs } from "node:fs";
import { repositoryRoot } from "./verify-image-contract.mjs";
import { verifySelfHostDocumentation } from "./verify-selfhost-documentation.mjs";

test("repository self-host runbooks expose parser-valid commands", async () => {
  const result = await verifySelfHostDocumentation();
  assert.equal(result.documents, 10);
  assert.equal(result.installerScenarios, 5);
  assert.equal(result.managementScenarios, 20);
  assert.equal(result.releaseCandidateScenarios, 1);
  assert.equal(result.attestationScenarios, 1);
  assert.equal(result.supportIssueFields, 10);
  assert.equal(result.workflowActions, 4);
});

test("rejects an actual mutation without the same dry-run", async () => {
  const changed = structuredClone(documentationContract);
  changed.managementScenarios = changed.managementScenarios.filter(
    ({ id }) => id !== "backup-dry-run",
  );
  await assert.rejects(
    verifySelfHostDocumentation(changed),
    /backup has no same-argument dry-run/,
  );
});

test("rejects an installer mutation without the same dry-run", async () => {
  const changed = structuredClone(documentationContract);
  changed.installerScenarios = changed.installerScenarios.filter(
    ({ id }) => id !== "install-no-start-dry-run",
  );
  await assert.rejects(
    verifySelfHostDocumentation(changed),
    /install-no-start has no same-argument dry-run/,
  );
});

test("rejects an undocumented or invalid option", async () => {
  const changed = structuredClone(documentationContract);
  changed.managementScenarios[0].argv.push("--invented");
  await assert.rejects(verifySelfHostDocumentation(changed), /unknown option/);
});

test("rejects an invalid documented release candidate invocation", async () => {
  const changed = structuredClone(documentationContract);
  changed.releaseCandidateScenarios[0].argv.splice(
    changed.releaseCandidateScenarios[0].argv.indexOf("--release-revision"),
    2,
  );
  await assert.rejects(
    verifySelfHostDocumentation(changed),
    /revision is invalid/,
  );
});

test("rejects an invalid documented release attestation invocation", async () => {
  const changed = structuredClone(documentationContract);
  changed.attestationScenarios[0].argv.splice(
    changed.attestationScenarios[0].argv.indexOf("--release-archive-sha256"),
    2,
  );
  await assert.rejects(
    verifySelfHostDocumentation(changed),
    /archive SHA-256 is invalid/,
  );
});

test("rejects an unversioned contract field", async () => {
  const changed = structuredClone(documentationContract);
  changed.allowBrokenLinks = true;
  await assert.rejects(
    verifySelfHostDocumentation(changed),
    /contract shape changed/,
  );
});

test("rejects removal of the periodic schedule", async () => {
  const source = await fs.readFile(
    `${repositoryRoot}/${documentationContract.workflow}`,
    "utf8",
  );
  await assert.rejects(
    verifySelfHostDocumentation(documentationContract, {
      workflowSource: source.replace(
        '    - cron: "17 3 * * 1"',
        '    - cron: "0 0 * * *"',
      ),
    }),
    /schedule changed/,
  );
});

test("rejects a documentation workflow that permits stale inventory", async () => {
  const source = await fs.readFile(
    `${repositoryRoot}/${documentationContract.workflow}`,
    "utf8",
  );
  await assert.rejects(
    verifySelfHostDocumentation(documentationContract, {
      workflowSource: source.replace(
        "pnpm selfhost:inventory:check",
        "node -e 'console.log(\"inventory skipped\")'",
      ),
    }),
    /scheduled command or cross-platform wrapper execution changed/,
  );
});

test("rejects an inventory check script that no longer checks", async () => {
  const source = await fs.readFile(`${repositoryRoot}/package.json`, "utf8");
  const changed = JSON.parse(source);
  changed.scripts["selfhost:inventory:check"] = "node -e 'process.exit(0)'";
  await assert.rejects(
    verifySelfHostDocumentation(documentationContract, {
      packageSource: JSON.stringify(changed),
    }),
    /inventory check command changed/,
  );
});

test("rejects a support issue form without mandatory privacy confirmation", async () => {
  const source = await fs.readFile(
    `${repositoryRoot}/${documentationContract.supportIssueTemplate}`,
    "utf8",
  );
  await assert.rejects(
    verifySelfHostDocumentation(documentationContract, {
      supportIssueSource: source.replace(
        "我已在本机人工检查 diagnostics 工件",
        "我没有检查 diagnostics 工件",
      ),
    }),
    /privacy confirmations changed/,
  );
});

test("rejects removal of the Windows entrypoint smoke", async () => {
  const source = await fs.readFile(
    `${repositoryRoot}/${documentationContract.workflow}`,
    "utf8",
  );
  await assert.rejects(
    verifySelfHostDocumentation(documentationContract, {
      workflowSource: source.replace(
        ".\\self-host.ps1 --help",
        "Write-Output skipped",
      ),
    }),
    /wrapper execution changed/,
  );
});
