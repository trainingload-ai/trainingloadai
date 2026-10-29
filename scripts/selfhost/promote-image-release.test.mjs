import assert from "node:assert/strict";
import test from "node:test";
import { validatePromotionState } from "./promote-image-release.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const manifest = {
  images: {
    server: {
      repository: "ghcr.io/example/trainingload-server",
      digest,
      reference: `ghcr.io/example/trainingload-server@${digest}`,
      tags: ["1.2.3", `sha-${"b".repeat(40)}`],
    },
  },
};

test("plans only missing immutable tags", () => {
  const revisionReference = `ghcr.io/example/trainingload-server:sha-${"b".repeat(40)}`;
  const operations = validatePromotionState(manifest, {
    [revisionReference]: digest,
  });
  assert.deepEqual(operations, [
    {
      role: "server",
      reference: "ghcr.io/example/trainingload-server:1.2.3",
      source: `ghcr.io/example/trainingload-server@${digest}`,
    },
  ]);
});

test("refuses to overwrite a tag bound to another digest", () => {
  assert.throws(
    () =>
      validatePromotionState(manifest, {
        "ghcr.io/example/trainingload-server:1.2.3": `sha256:${"c".repeat(64)}`,
      }),
    /refusing to overwrite/,
  );
});
