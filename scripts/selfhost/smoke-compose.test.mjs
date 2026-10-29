import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateSmokeCleanupFailure,
  cleanupSmokeResources,
  evaluateComposeState,
  parseComposePs,
} from "./smoke-compose.mjs";

test("Compose smoke cleanup attempts every action and preserves every failure", async () => {
  const spawnFailure = new Error("ownership runner failed");
  const removeFailure = new Error("workspace removal failed");
  const calls = [];
  const cleanupErrors = await cleanupSmokeResources({
    cleanupStacks: [
      { composeArgs: ["compose", "--project-name", "first"] },
      { composeArgs: ["compose", "--project-name", "second"] },
    ],
    stackTouched: true,
    workspace: "/private/smoke-workspace",
    uid: 501,
    gid: 20,
    runDocker: async (args, options) => {
      calls.push({ args, options });
      if (calls.length === 1) return { status: 1, error: null };
      if (calls.length === 2) throw spawnFailure;
      if (calls.length === 3) return { status: 2, error: null };
      return { status: 0, error: null };
    },
    removeWorkspace: async (path, options) => {
      calls.push({ path, options });
      throw removeFailure;
    },
  });

  assert.equal(calls.length, 7);
  assert.match(cleanupErrors[0].message, /stop cleanup failed with exit 1/);
  assert.equal(cleanupErrors[1].cause, spawnFailure);
  assert.match(cleanupErrors[2].message, /resource cleanup failed with exit 2/);
  assert.equal(cleanupErrors[3], removeFailure);
  const terminalError = new Error("smoke assertion failed");
  const aggregate = aggregateSmokeCleanupFailure(terminalError, cleanupErrors);
  assert.equal(aggregate instanceof AggregateError, true);
  assert.deepEqual(aggregate.errors, [terminalError, ...cleanupErrors]);
});

test("parses Compose JSON arrays and JSON-lines output", () => {
  const rows = [
    { Service: "postgres", State: "running", Health: "healthy", ExitCode: 0 },
    { Service: "server", State: "running", Health: "healthy", ExitCode: 0 },
  ];
  assert.deepEqual(parseComposePs(JSON.stringify(rows)), rows);
  assert.deepEqual(
    parseComposePs(rows.map((row) => JSON.stringify(row)).join("\n")),
    rows,
  );
});

test("recognizes a healthy stack with successful one-shot jobs", () => {
  const state = evaluateComposeState([
    { Service: "permissions", State: "exited", ExitCode: 0 },
    { Service: "migrate", State: "exited", ExitCode: 0 },
    { Service: "postgres", State: "running", Health: "healthy" },
    { Service: "server", State: "running", Health: "healthy" },
    { Service: "client", State: "running", Health: "healthy" },
  ]);
  assert.deepEqual(state, { failures: [], waiting: [] });
});

test("requires an enabled optional profile service to be healthy", () => {
  const rows = [
    { Service: "permissions", State: "exited", ExitCode: 0 },
    { Service: "migrate", State: "exited", ExitCode: 0 },
    { Service: "postgres", State: "running", Health: "healthy" },
    { Service: "server", State: "running", Health: "healthy" },
    { Service: "client", State: "running", Health: "healthy" },
  ];
  assert.deepEqual(evaluateComposeState(rows, ["optional-worker"]).waiting, [
    "optional-worker:not-running",
  ]);
  assert.deepEqual(
    evaluateComposeState(
      [...rows, { Service: "optional-worker", State: "running", Health: "healthy" }],
      ["optional-worker"],
    ),
    { failures: [], waiting: [] },
  );
});

test("fails fast when migration exits unsuccessfully", () => {
  const state = evaluateComposeState([
    { Service: "migrate", State: "exited", ExitCode: 1 },
  ]);
  assert.deepEqual(state.failures, ["migrate exited with 1"]);
  assert.ok(state.waiting.length > 0);
});
