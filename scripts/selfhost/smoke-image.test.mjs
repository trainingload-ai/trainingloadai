import assert from "node:assert/strict";
import test from "node:test";
import imageContract from "../../docker/selfhost/image-contract.json" with { type: "json" };
import { platformArchitecture, validateImageInspect } from "./smoke-image.mjs";

function validInspect(role = "server", platform = "linux/amd64") {
  const definition = imageContract.images[role];
  const labels = {
    "io.trainingload.selfhost.image-role": role,
    "io.trainingload.selfhost.config-schema": "1",
    "org.opencontainers.image.version": "1.1.13",
    "org.opencontainers.image.revision": "a".repeat(40),
    "org.opencontainers.image.source": "https://github.com/example/project",
    "org.opencontainers.image.licenses": "AGPL-3.0-only",
    "org.opencontainers.image.base.name":
      imageContract.baseImages[definition.baseImage].reference,
  };
  if (definition.runtimeLayout === "scratch-minimal-rootfs") {
    labels["io.trainingload.selfhost.node.source"] =
      imageContract.baseImages.node.reference;
  }
  return {
    Os: "linux",
    Architecture: platformArchitecture(platform).image,
    Config: {
      User: "10001:10001",
      WorkingDir: definition.workdir,
      Cmd: definition.entrypoint,
      ExposedPorts: { [`${definition.port}/tcp`]: {} },
      Env: ["NODE_ENV=production", `PORT=${definition.port}`],
      Labels: labels,
    },
    RootFS: { Layers: ["sha256:abc"] },
  };
}

const expected = {
  role: "server",
  platform: "linux/amd64",
  version: "1.1.13",
  revision: "a".repeat(40),
  source: "https://github.com/example/project",
};

test("accepts the complete runtime image contract", () => {
  assert.deepEqual(
    validateImageInspect(validInspect(), expected, imageContract),
    [],
  );
});

test("rejects root, the wrong architecture, and mutable metadata", () => {
  const inspect = validInspect();
  inspect.Config.User = "0:0";
  inspect.Architecture = "arm64";
  inspect.Config.Labels["org.opencontainers.image.revision"] = "wrong";
  const codes = validateImageInspect(inspect, expected, imageContract).map(
    (error) => error.code,
  );
  assert.ok(codes.includes("USER"));
  assert.ok(codes.includes("ARCH"));
  assert.ok(codes.includes("LABEL"));
});

test("maps supported image platforms to Node architectures", () => {
  assert.deepEqual(platformArchitecture("linux/amd64"), {
    image: "amd64",
    node: "x64",
  });
  assert.deepEqual(platformArchitecture("linux/arm64"), {
    image: "arm64",
    node: "arm64",
  });
  assert.throws(() => platformArchitecture("linux/s390x"));
});
