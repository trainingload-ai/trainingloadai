import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  isCatalogedSelfHostError,
  SELF_HOST_ERROR_CATALOG,
  renderErrorCatalogMarkdown,
  selfHostErrorDefinition,
} from "./error-catalog.mjs";
import { SELF_HOST_INSTANCE_CONFIG_KEYS } from "./management-core.mjs";
import { repositoryRoot } from "./verify-compose-contract.mjs";

const NON_ERROR_LITERALS = new Set(SELF_HOST_INSTANCE_CONFIG_KEYS);

test("error catalog entries are stable, actionable, and unique", () => {
  assert.ok(SELF_HOST_ERROR_CATALOG.length > 90);
  assert.equal(
    new Set(SELF_HOST_ERROR_CATALOG.map((entry) => entry.code)).size,
    SELF_HOST_ERROR_CATALOG.length,
  );
  for (const entry of SELF_HOST_ERROR_CATALOG) {
    assert.match(entry.code, /^SELF_HOST_[A-Z0-9_]+$/);
    assert.ok([0, 2, 3, 4, 5, 6, 7, 8, 10].includes(entry.defaultExitCode));
    assert.match(entry.remediationId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(
      entry.documentation,
      /^docs\/self-hosting\/error-catalog\.zh\.md#[a-z-]+$/,
    );
    assert.equal(selfHostErrorDefinition(entry.code), entry);
  }
});

test("every emitted management error and warning is cataloged", async () => {
  const sources = await Promise.all(
    [
      "management-core.mjs",
      "cli.mjs",
      "doctor-core.mjs",
      "install-core.mjs",
      "install.mjs",
    ].map((name) =>
      fs.readFile(resolve(repositoryRoot, "scripts/selfhost", name), "utf8"),
    ),
  );
  const source = sources.join("\n");
  const doctorCheckCodes = new Set(
    [
      ...source.matchAll(
        /doctorCheck\(\s*["'](SELF_HOST_DOCTOR_[A-Z0-9_]+)["']/g,
      ),
    ].map((match) => match[1]),
  );
  const configurationKeys = new Set(
    [
      ...source.matchAll(
        /values\.(?:get|has)\(\s*["'](SELF_HOST_[A-Z0-9_]+)["']/g,
      ),
    ].map((match) => match[1]),
  );
  const literals = new Set(
    [...source.matchAll(/["'](SELF_HOST_[A-Z0-9_]+)["']/g)].map(
      (match) => match[1],
    ),
  );
  const uncataloged = [...literals]
    .filter(
      (code) =>
        !NON_ERROR_LITERALS.has(code) &&
        !configurationKeys.has(code) &&
        !doctorCheckCodes.has(code),
    )
    .filter((code) => !isCatalogedSelfHostError(code))
    .sort();
  assert.deepEqual(uncataloged, []);
});

test("generated human error catalog matches the machine source of truth", async () => {
  const documentation = await fs.readFile(
    resolve(repositoryRoot, "docs/self-hosting/error-catalog.zh.md"),
    "utf8",
  );
  assert.equal(documentation, renderErrorCatalogMarkdown());
});
