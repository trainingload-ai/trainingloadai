import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

for (const [file, check] of [["ci.yml", "core"], ["docs.yml", "docs"]]) {
  test(`${check} reports a required check for every pull request to main`, async () => {
    const source = await readFile(
      new URL(`../../.github/workflows/${file}`, import.meta.url),
      "utf8",
    );
    const workflow = parse(source);
    const trigger = workflow.on.pull_request;

    assert.ok(trigger, "required checks must run on pull_request");
    assert.deepEqual(trigger.branches, ["main"]);
    for (const filter of ["paths", "paths-ignore", "branches-ignore", "types"]) {
      assert.equal(trigger[filter], undefined, `${filter} can leave a required check pending`);
    }

    const job = workflow.jobs[check];
    assert.ok(job, `branch protection requires the ${check} job name`);
    assert.equal(job.if, undefined, "required validation must not be skipped");
    assert.notEqual(job["continue-on-error"], true, "validation failures must block merging");
    assert.deepEqual(workflow.permissions, { contents: "read" });
  });
}
