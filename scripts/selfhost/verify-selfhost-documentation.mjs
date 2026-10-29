import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import documentationContract from "../../docker/selfhost/documentation-contract.json" with { type: "json" };
import bundleContract from "../../docker/selfhost/release-bundle-contract.json" with { type: "json" };
import supplyChainContract from "../../docker/selfhost/supply-chain-contract.json" with { type: "json" };
import { parseInstallArguments } from "./install-core.mjs";
import { parseManagementArguments } from "./management-core.mjs";
import { parseReleaseAttestationPreparationArguments } from "./release-attestation.mjs";
import { parseReleaseCandidateVerificationArguments } from "./verify-release-candidate.mjs";
import { repositoryRoot } from "./verify-image-contract.mjs";

const EXACT_ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "workflow",
  "supportIssueTemplate",
  "schedule",
  "nodeVersion",
  "documents",
  "installerScenarios",
  "managementScenarios",
  "releaseCandidateScenarios",
  "attestationScenarios",
  "forbiddenExecutablePatterns",
]);

function hasExactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function invariant(condition, message) {
  if (!condition) throw new Error(`self-host documentation drift: ${message}`);
}

function executableBlocks(markdown) {
  return [
    ...markdown.matchAll(
      /```(?:bash|sh|shell|powershell|pwsh)\s*\n([\s\S]*?)```/g,
    ),
  ].map((match) => match[1]);
}

async function verifyLocalLinks(documentPath, markdown) {
  const base = dirname(resolve(repositoryRoot, documentPath));
  for (const match of markdown.matchAll(
    /\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g,
  )) {
    const target = match[1].split("#")[0];
    if (/^[a-z]+:/i.test(target)) continue;
    const resolved = resolve(base, target);
    const stat = await fs.lstat(resolved).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    invariant(
      stat?.isFile() && !stat.isSymbolicLink(),
      `${documentPath} has a broken link: ${target}`,
    );
  }
}

function validateScenario(scenario, kind, documents) {
  invariant(
    hasExactKeys(scenario, ["id", "document", "argv", "requiredTokens"]) &&
      /^[a-z0-9-]+$/.test(scenario.id) &&
      documents.has(scenario.document) &&
      Array.isArray(scenario.argv) &&
      scenario.argv.length > 0 &&
      scenario.argv.every((value) => typeof value === "string" && value) &&
      Array.isArray(scenario.requiredTokens) &&
      scenario.requiredTokens.length > 0,
    `invalid ${kind} scenario`,
  );
}

function mutationKey(argv) {
  return argv.filter((argument) => argument !== "--dry-run").join("\0");
}

function validateSupportIssueTemplate(source) {
  const template = YAML.parse(source);
  invariant(
    hasExactKeys(template, [
      "name",
      "description",
      "title",
      "labels",
      "body",
    ]) &&
      template.name === "Self-host 支持" &&
      Array.isArray(template.labels) &&
      template.labels.includes("self-host") &&
      Array.isArray(template.body),
    "support issue template shape changed",
  );
  const introduction = template.body.find((item) => item?.type === "markdown")
    ?.attributes?.value;
  invariant(
    typeof introduction === "string" &&
      [
        ".env.selfhost",
        "token",
        "cookie",
        "私钥",
        "数据库 dump",
        "人工检查",
        "私密渠道",
      ].every((token) => introduction.includes(token)),
    "support issue privacy warning changed",
  );
  const fields = template.body.filter((item) => typeof item?.id === "string");
  const expectedIds = [
    "release",
    "platform",
    "mode",
    "doctor",
    "reproduction",
    "expected",
    "actual",
    "bundle_hash",
    "recent_changes",
    "privacy",
  ];
  invariant(
    JSON.stringify(fields.map(({ id }) => id)) === JSON.stringify(expectedIds),
    "support issue field inventory changed",
  );
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const id of [
    "release",
    "platform",
    "mode",
    "doctor",
    "reproduction",
    "expected",
    "actual",
  ]) {
    invariant(
      byId.get(id)?.validations?.required === true,
      `support issue field is no longer required: ${id}`,
    );
  }
  invariant(
    JSON.stringify(byId.get("mode")?.attributes?.options) ===
      JSON.stringify([
        "core-local",
        "connected",
        "extended",
        "unknown / 无法启动",
      ]),
    "support issue runtime mode options changed",
  );
  const privacyOptions = byId.get("privacy")?.attributes?.options;
  invariant(
    Array.isArray(privacyOptions) &&
      privacyOptions.length === 2 &&
      privacyOptions.every(
        (option) =>
          option?.required === true && typeof option.label === "string",
      ) &&
      privacyOptions[0].label.includes("secret") &&
      privacyOptions[0].label.includes(".env.selfhost") &&
      privacyOptions[1].label.includes("人工检查") &&
      privacyOptions[1].label.includes("自动脱敏不等于匿名性保证"),
    "support issue privacy confirmations changed",
  );
  invariant(
    !byId.get("bundle_hash")?.validations?.required &&
      byId
        .get("bundle_hash")
        ?.attributes?.description?.includes("不要公开附加工件"),
    "support issue diagnostics upload boundary changed",
  );
  return fields.length;
}

export async function verifySelfHostDocumentation(
  contract = documentationContract,
  { workflowSource, packageSource, supportIssueSource } = {},
) {
  invariant(hasExactKeys(contract, EXACT_ROOT_KEYS), "contract shape changed");
  invariant(
    contract.schemaVersion === 3 &&
      contract.workflow === ".github/workflows/selfhost-docs.yml" &&
      contract.supportIssueTemplate ===
        ".github/ISSUE_TEMPLATE/self-host-support.yml" &&
      contract.schedule === "17 3 * * 1" &&
      contract.nodeVersion === "22.23.3",
    "contract identity changed",
  );
  const supportIssuePath = resolve(
    repositoryRoot,
    contract.supportIssueTemplate,
  );
  const supportIssueStat = await fs.lstat(supportIssuePath);
  invariant(
    supportIssueStat.isFile() && !supportIssueStat.isSymbolicLink(),
    "unsafe support issue template",
  );
  const supportIssueFields = validateSupportIssueTemplate(
    supportIssueSource ?? (await fs.readFile(supportIssuePath, "utf8")),
  );
  const documents = new Set(contract.documents);
  invariant(
    documents.size === contract.documents.length && documents.size >= 5,
    "document inventory is empty or duplicated",
  );
  const contents = new Map();
  for (const path of documents) {
    const fullPath = resolve(repositoryRoot, path);
    const stat = await fs.lstat(fullPath);
    invariant(
      stat.isFile() && !stat.isSymbolicLink(),
      `unsafe document: ${path}`,
    );
    const markdown = await fs.readFile(fullPath, "utf8");
    invariant(markdown.trim().length > 0, `empty document: ${path}`);
    contents.set(path, markdown);
    await verifyLocalLinks(path, markdown);
    for (const block of executableBlocks(markdown)) {
      for (const pattern of contract.forbiddenExecutablePatterns) {
        invariant(
          !block.includes(pattern),
          `${path} executable block contains forbidden command: ${pattern}`,
        );
      }
    }
  }

  const scenarioIds = new Set();
  const installers = [];
  for (const scenario of contract.installerScenarios) {
    validateScenario(scenario, "installer", documents);
    invariant(
      !scenarioIds.has(scenario.id),
      `duplicate scenario: ${scenario.id}`,
    );
    scenarioIds.add(scenario.id);
    const parsed = parseInstallArguments(scenario.argv);
    invariant(!parsed.help, `${scenario.id} only requests help`);
    const markdown = contents.get(scenario.document);
    invariant(
      scenario.requiredTokens.every((token) => markdown.includes(token)),
      `${scenario.id} is no longer represented in ${scenario.document}`,
    );
    installers.push({ scenario, parsed });
  }
  for (const { scenario } of installers.filter(
    ({ parsed }) => !parsed.dryRun,
  )) {
    invariant(
      installers.some(
        ({ scenario: candidate, parsed: candidateParsed }) =>
          candidateParsed.dryRun &&
          mutationKey(candidate.argv) === mutationKey(scenario.argv),
      ),
      `${scenario.id} has no same-argument dry-run`,
    );
  }

  const management = [];
  for (const scenario of contract.managementScenarios) {
    validateScenario(scenario, "management", documents);
    invariant(
      !scenarioIds.has(scenario.id),
      `duplicate scenario: ${scenario.id}`,
    );
    scenarioIds.add(scenario.id);
    const parsed = parseManagementArguments(scenario.argv);
    invariant(
      parsed.command === scenario.argv[0],
      `${scenario.id} parsed as another command`,
    );
    invariant(parsed.json === true, `${scenario.id} is not machine-readable`);
    const markdown = contents.get(scenario.document);
    invariant(
      scenario.requiredTokens.every((token) => markdown.includes(token)),
      `${scenario.id} is no longer represented in ${scenario.document}`,
    );
    management.push({ scenario, parsed });
  }

  // Password-based Owner commands remain legacy maintenance APIs; current
  // public initialization is the single-name browser flow, not a login guide.
  for (const command of [
    "start",
    "stop",
    "backup",
    "restore",
    "upgrade",
    "rollback",
    "uninstall",
  ]) {
    const actual = management.filter(
      ({ parsed }) => parsed.command === command && !parsed.dryRun,
    );
    invariant(
      actual.length > 0,
      `${command} has no documented actual invocation`,
    );
    for (const { scenario } of actual) {
      invariant(
        management.some(
          ({ scenario: candidate, parsed }) =>
            parsed.command === command &&
            parsed.dryRun &&
            mutationKey(candidate.argv) === mutationKey(scenario.argv),
        ),
        `${scenario.id} has no same-argument dry-run`,
      );
    }
  }

  for (const scenario of contract.releaseCandidateScenarios) {
    validateScenario(scenario, "release candidate", documents);
    invariant(
      !scenarioIds.has(scenario.id),
      `duplicate scenario: ${scenario.id}`,
    );
    scenarioIds.add(scenario.id);
    const parsed = parseReleaseCandidateVerificationArguments(scenario.argv);
    invariant(parsed.json === true, `${scenario.id} is not machine-readable`);
    const markdown = contents.get(scenario.document);
    invariant(
      scenario.requiredTokens.every((token) => markdown.includes(token)),
      `${scenario.id} is no longer represented in ${scenario.document}`,
    );
  }

  for (const scenario of contract.attestationScenarios) {
    validateScenario(scenario, "release attestation", documents);
    invariant(
      !scenarioIds.has(scenario.id),
      `duplicate scenario: ${scenario.id}`,
    );
    scenarioIds.add(scenario.id);
    const parsed = parseReleaseAttestationPreparationArguments(scenario.argv);
    invariant(parsed.json === true, `${scenario.id} is not machine-readable`);
    const markdown = contents.get(scenario.document);
    invariant(
      scenario.requiredTokens.every((token) => markdown.includes(token)),
      `${scenario.id} is no longer represented in ${scenario.document}`,
    );
  }

  const bundleFiles = new Set(bundleContract.files.map(({ path }) => path));
  for (const path of contract.documents.filter(
    (item) => !item.startsWith("ai_docs/"),
  )) {
    invariant(
      bundleFiles.has(path),
      `release bundle omits user document: ${path}`,
    );
  }
  const source =
    workflowSource ??
    (await fs.readFile(resolve(repositoryRoot, contract.workflow), "utf8"));
  const rootPackage = JSON.parse(
    packageSource ??
      (await fs.readFile(resolve(repositoryRoot, "package.json"), "utf8")),
  );
  invariant(
    rootPackage.scripts?.["selfhost:inventory:check"] ===
      "node scripts/generate-selfhost-inventory.mjs --check",
    "inventory check command changed",
  );
  const workflow = YAML.parse(source);
  invariant(
    hasExactKeys(workflow.on, ["workflow_dispatch", "schedule", "push"]),
    "documentation workflow triggers changed",
  );
  invariant(
    Array.isArray(workflow.on.schedule) &&
      workflow.on.schedule.length === 1 &&
      workflow.on.schedule[0].cron === contract.schedule,
    "periodic documentation schedule changed",
  );
  invariant(
    workflow.on.push?.paths?.includes(
      "docker/selfhost/documentation-contract.json",
    ) &&
      workflow.on.push.paths.includes(contract.supportIssueTemplate) &&
      workflow.permissions?.contents === "read" &&
      Object.keys(workflow.permissions).length === 1 &&
      workflow.env?.NODE_VERSION === contract.nodeVersion,
    "documentation workflow scope or permissions changed",
  );
  invariant(
    hasExactKeys(workflow.jobs, ["validate-docs", "wrapper-smoke"]),
    "documentation workflow jobs changed",
  );
  const actionReferences = Object.values(workflow.jobs).flatMap((job) =>
    job.steps.flatMap((step) => (step.uses ? [step.uses] : [])),
  );
  for (const reference of actionReferences) {
    const [name, revision] = reference.split("@");
    const action = supplyChainContract.actions[name];
    invariant(
      action &&
        /^[a-f0-9]{40}$/.test(revision ?? "") &&
        revision === action.sha,
      `documentation workflow action is mutable: ${reference}`,
    );
  }
  for (const name of ["actions/checkout", "actions/setup-node"]) {
    invariant(
      actionReferences.includes(
        `${name}@${supplyChainContract.actions[name].sha}`,
      ),
      `documentation workflow omits ${name}`,
    );
  }
  const validateSource = workflow.jobs["validate-docs"].steps
    .map((step) => step.run ?? "")
    .join("\n");
  const wrapperJob = workflow.jobs["wrapper-smoke"];
  const wrapperSource = wrapperJob.steps
    .map((step) => step.run ?? "")
    .join("\n");
  invariant(
    workflow.jobs["validate-docs"]["runs-on"] === "ubuntu-24.04" &&
      validateSource.includes("pnpm selfhost:inventory:check") &&
      validateSource.includes("pnpm selfhost:docs-contract") &&
      validateSource.includes("verify-selfhost-documentation.test.mjs") &&
      JSON.stringify(wrapperJob.strategy?.matrix?.os) ===
        JSON.stringify(["ubuntu-24.04", "windows-2025"]) &&
      wrapperJob.strategy?.["fail-fast"] === false &&
      wrapperSource.includes("./install.sh --help") &&
      wrapperSource.includes("./self-host --help") &&
      wrapperSource.includes(".\\install.ps1 --help") &&
      wrapperSource.includes(".\\self-host.ps1 --help"),
    "scheduled command or cross-platform wrapper execution changed",
  );
  return {
    documents: documents.size,
    installerScenarios: contract.installerScenarios.length,
    managementScenarios: contract.managementScenarios.length,
    releaseCandidateScenarios: contract.releaseCandidateScenarios.length,
    attestationScenarios: contract.attestationScenarios.length,
    supportIssueFields,
    workflowActions: actionReferences.length,
  };
}

async function main() {
  const result = await verifySelfHostDocumentation();
  process.stdout.write(
    `self-host documentation: PASS (${result.documents} documents, ${result.installerScenarios + result.managementScenarios + result.releaseCandidateScenarios + result.attestationScenarios} command scenarios)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

export { executableBlocks };
