import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import {
  assertMacCloudContext,
  cleanupMacCloudCredentials,
  importMacCloudCredentials,
} from "./macos-ci-credentials.mjs";
import { assertCloudEnvironment } from "./configure-macos-cloud.mjs";

const repository = "example/public";
const event = {
  repository: { full_name: repository, private: false, default_branch: "main" },
};
const context = {
  GITHUB_ACTIONS: "true",
  RUNNER_OS: "macOS",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: repository,
  RUNNER_TEMP: tmpdir(),
};
const workflow = (name) =>
  parse(
    readFileSync(
      new URL(`../../../.github/workflows/${name}.yml`, import.meta.url),
      "utf8",
    ),
  );

test("credential upload requires server-enforced main-only deployment policy", () => {
  const environment = {
    deployment_branch_policy: {
      custom_branch_policies: true,
      protected_branches: false,
    },
  };
  const policies = { branch_policies: [{ name: "main", type: "branch" }] };
  assert.doesNotThrow(() => assertCloudEnvironment(environment, policies));
  for (const branch_policies of [
    [],
    [{ name: "*", type: "branch" }],
    [{ name: "main", type: "tag" }],
    [...policies.branch_policies, { name: "feature", type: "branch" }],
  ])
    assert.throws(
      () => assertCloudEnvironment(environment, { branch_policies }),
      /DESKTOP_CLOUD_ENVIRONMENT/,
    );
  assert.throws(
    () => assertCloudEnvironment({ deployment_branch_policy: null }, policies),
    /DESKTOP_CLOUD_ENVIRONMENT/,
  );
});

test("cloud signing rejects pull requests, arbitrary branches and private repositories", () => {
  assert.doesNotThrow(() => assertMacCloudContext(context, event));
  for (const change of [
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_EVENT_NAME: "pull_request_target" },
    { GITHUB_ACTIONS: "false" },
  ])
    assert.throws(
      () => assertMacCloudContext({ ...context, ...change }, event),
      /DESKTOP_CLOUD_CONTEXT/,
    );
  assert.throws(
    () =>
      assertMacCloudContext(context, {
        repository: { ...event.repository, private: true },
      }),
    /DESKTOP_CLOUD_CONTEXT/,
  );
});

test("PR verification cannot access release secrets and release evidence excludes credentials", () => {
  const verify = workflow("desktop-macos-verify");
  const release = workflow("desktop-macos-release");
  assert.deepEqual(verify.permissions, { contents: "read" });
  assert.ok(verify.on.pull_request);
  assert.ok(!JSON.stringify(verify).includes("secrets."));
  assert.deepEqual(Object.keys(release.on), ["workflow_dispatch"]);
  const job = release.jobs.release;
  assert.equal(job.environment, "desktop-macos-release");
  assert.equal(job["runs-on"], "macos-15");
  assert.match(job.if, /refs\/heads\/main/);
  const secretSteps = job.steps.filter((step) =>
    JSON.stringify(step).includes("secrets."),
  );
  assert.equal(secretSteps.length, 1);
  assert.match(secretSteps[0].run, /macos-ci-credentials\.mjs import/);
  assert.equal(job.steps.at(-1).if, "always()");
  assert.match(job.steps.at(-1).run, /cleanup/);
  const upload = job.steps.find((step) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  );
  assert.equal(upload.with["retention-days"], 1);
  for (const path of upload.with.path.trim().split("\n"))
    assert.match(path, /\/(?:release|notarization)\.json$/);
  for (const source of [verify, release])
    for (const step of Object.values(source.jobs).flatMap((item) => item.steps))
      if (step.uses) assert.match(step.uses, /^actions\/[a-z-]+@[a-f0-9]{40}$/);
});

test("CI password stays in stdin and cleanup removes only its own temporary credentials", () => {
  const temporary = mkdtempSync(join(tmpdir(), "desktop-cloud-credentials-"));
  try {
    const env = {
      ...context,
      RUNNER_TEMP: temporary,
      GITHUB_EVENT_PATH: join(temporary, "event.json"),
      GITHUB_ENV: join(temporary, "environment"),
      DESKTOP_MAC_P12_BASE64:
        Buffer.from("encrypted fixture").toString("base64"),
      DESKTOP_MAC_P12_PASSWORD: "fixture-p12-password",
      DESKTOP_MAC_APPLE_ID: "fixture@example.invalid",
      DESKTOP_MAC_APP_PASSWORD: "fixture-notary-password",
      DESKTOP_MAC_TEAM_ID: "TEAM123456",
    };
    writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify(event));
    const commands = [];
    const run = (command, args, options) => {
      commands.push({ command, args, input: options?.input });
      if (args[0] === "list-keychains" && !args.includes("-s"))
        return '"/original/login.keychain-db"\n';
      if (args[0] === "default-keychain" && !args.includes("-s"))
        return '"/original/default.keychain-db"\n';
      if (args[0] === "create-keychain")
        writeFileSync(args.at(-1), "temporary fixture");
      return "";
    };
    importMacCloudCredentials(env, run);
    assert.deepEqual(
      commands.find(
        (item) =>
          item.args[0] === "default-keychain" && item.args.includes("-s"),
      ).args,
      [
        "default-keychain",
        "-d",
        "user",
        "-s",
        join(temporary, "trainingload-desktop-signing/signing.keychain-db"),
      ],
    );
    const notary = commands.find((item) => item.command === "xcrun");
    assert.equal(notary.input, env.DESKTOP_MAC_APP_PASSWORD + "\n");
    assert.ok(
      !JSON.stringify(commands.map((item) => item.args)).includes(
        env.DESKTOP_MAC_APP_PASSWORD,
      ),
    );
    const exported = readFileSync(env.GITHUB_ENV, "utf8");
    for (const secret of [
      env.DESKTOP_MAC_APP_PASSWORD,
      env.DESKTOP_MAC_P12_PASSWORD,
      env.DESKTOP_MAC_APPLE_ID,
      env.DESKTOP_MAC_P12_BASE64,
    ])
      assert.ok(!exported.includes(secret));
    cleanupMacCloudCredentials(env, run);
    assert.deepEqual(commands.at(-3).args, [
      "default-keychain",
      "-d",
      "user",
      "-s",
      "/original/default.keychain-db",
    ]);
    assert.deepEqual(commands.at(-2).args, [
      "list-keychains",
      "-d",
      "user",
      "-s",
      "/original/login.keychain-db",
    ]);
    assert.equal(commands.at(-1).args[0], "delete-keychain");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
