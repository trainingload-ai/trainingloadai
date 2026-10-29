import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  composeInterpolationVariables,
  isolateComposeEnvironment,
} from "./compose-environment.mjs";

test("isolates braced, nested, and unbraced Compose interpolation variables", () => {
  const sources = [
    'one: "${OUTER:-${INNER:-$UNBRACED}}-$lowerName-${_UNDER}"',
    "SELF_HOST_DATA_ROOT=./${hostSegment}",
    'escaped: "$${CONTAINER_ONLY}"',
    'mixed: "$$${AFTER_ESCAPED_DOLLAR}"',
  ];
  assert.deepEqual([...composeInterpolationVariables(sources)].sort(), [
    "AFTER_ESCAPED_DOLLAR",
    "INNER",
    "OUTER",
    "UNBRACED",
    "_UNDER",
    "hostSegment",
    "lowerName",
  ]);
  assert.deepEqual(
    isolateComposeEnvironment(
      {
        PATH: "/bin",
        DOCKER_HOST: "unix:///docker.sock",
        OUTER: "host-outer",
        AFTER_ESCAPED_DOLLAR: "host-after-escaped-dollar",
        inner: "host-inner",
        LOWERNAME: "host-lower-name",
        UNBRACED: "host-unbraced",
        _under: "host-under",
        HOSTSEGMENT: "host-segment",
        COMPOSE_PROFILES: "docs",
      },
      sources,
    ),
    { PATH: "/bin", DOCKER_HOST: "unix:///docker.sock" },
  );
});

test("rejects malformed isolation inputs", () => {
  assert.throws(() => isolateComposeEnvironment(null, []), TypeError);
  assert.throws(() => isolateComposeEnvironment({}, [null]), TypeError);
});

test("smoke and acceptance runners share the Compose environment isolator", async () => {
  const repositoryRoot = resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
  );
  for (const path of [
    "scripts/selfhost/smoke-compose.mjs",
    "scripts/selfhost/run-acceptance.mjs",
  ]) {
    const source = await fs.readFile(resolve(repositoryRoot, path), "utf8");
    assert.match(source, /import \{ isolateComposeEnvironment \}/);
    assert.match(source, /commandEnvironment = isolateComposeEnvironment\(/);
  }
  const smoke = await fs.readFile(
    resolve(repositoryRoot, "scripts/selfhost/smoke-compose.mjs"),
    "utf8",
  );
  assert.match(
    smoke,
    /composeEnvironmentSources\.push\(await readFile\(environmentFile/,
  );
  assert.match(
    smoke,
    /function dockerAvailable\(\)[\s\S]*?env: commandEnvironment/,
  );
  const acceptance = await fs.readFile(
    resolve(repositoryRoot, "scripts/selfhost/run-acceptance.mjs"),
    "utf8",
  );
  assert.match(acceptance, /await registerComposeEnvironmentFile\(path\)/);
});
