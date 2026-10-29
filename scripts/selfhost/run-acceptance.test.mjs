import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import TrackSwap from "trackswap";
import {
  acceptanceCleanupFailure,
  createAcceptanceGpx,
  extractSessionCookie,
  extractDoctorReport,
  networkReconnectArguments,
  readAcceptanceJson,
  reservePorts,
  startTileFixture,
  validateRuntimeCapabilitySnapshot,
  withRequiredAcceptanceRecovery,
} from "./run-acceptance.mjs";

test("required acceptance recovery preserves primary and recovery failures", async () => {
  const primary = new Error("fault assertion failed");
  const recovery = new Error("recovery failed");
  const calls = [];
  await assert.rejects(
    withRequiredAcceptanceRecovery(
      async () => {
        calls.push("operation");
        throw primary;
      },
      async () => {
        calls.push("recovery");
        throw recovery;
      },
      "fault recovery",
    ),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual(error.errors, [primary, recovery]);
      assert.match(error.message, /fault recovery/);
      return true;
    },
  );
  assert.deepEqual(calls, ["operation", "recovery"]);

  await assert.rejects(
    withRequiredAcceptanceRecovery(
      async () => "complete",
      async () => {
        throw recovery;
      },
      "successful fault recovery",
    ),
    (error) => error === recovery,
  );
  await assert.rejects(
    withRequiredAcceptanceRecovery(
      async () => {
        throw primary;
      },
      async () => undefined,
      "completed recovery",
    ),
    (error) => error === primary,
  );
});

test("acceptance cleanup command failures remain observable", () => {
  assert.equal(
    acceptanceCleanupFailure(
      { status: 0, stdout: "", stderr: "", error: null },
      "cleanup",
    ),
    null,
  );
  const cause = new Error("spawn failed");
  const failure = acceptanceCleanupFailure(
    { status: null, stdout: "", stderr: "", error: cause },
    "Compose cleanup",
  );
  assert.match(failure.message, /Compose cleanup failed with exit null/);
  assert.equal(failure.cause, cause);
});

function capability(name, provider, state, required = false) {
  return { name, provider, state, required, issues: [] };
}

function capabilitySnapshot(mode) {
  const connected = mode === "connected";
  const tileUrl = "http://127.0.0.1:42000/{z}/{x}/{y}.png";
  return {
    schemaVersion: 1,
    deployment: "self-host",
    mode,
    ready: true,
    startupErrors: [],
    startupWarnings: [],
    map: connected
      ? {
          provider: "custom-raster",
          styleUrl: null,
          tileUrl,
          attribution: "Acceptance fixture tiles",
          maxZoom: 19,
          publicToken: null,
          tilePolicy: { browserOnly: false, bulkDownloadAllowed: false },
        }
      : {
          provider: "none",
          styleUrl: null,
          tileUrl: null,
          attribution: null,
          maxZoom: 18,
          publicToken: null,
          tilePolicy: { browserOnly: false, bulkDownloadAllowed: false },
        },
    capabilities: {
      database: capability("database", "postgresql", "enabled", true),
      storage: capability("storage", "LOCAL", "enabled", true),
      authentication: capability("authentication", "local", "enabled", true),
      maps: capability(
        "maps",
        connected ? "custom-raster" : "none",
        connected ? "enabled" : "disabled",
      ),
      elevation: capability("elevation", "none", "disabled"),
      ai: capability("ai", "none", "disabled"),
      mail: capability("mail", "none", "disabled"),
      billing: capability("billing", "none", "disabled"),
      telemetry: capability("telemetry", "none", "disabled"),
      weather: capability("weather", "none", "disabled"),
      "third-party-sync": capability(
        "third-party-sync",
        "per-provider",
        "disabled",
      ),
      "agent-api": capability("agent-api", "builtin", "disabled"),
      "public-demo": capability("public-demo", "none", "disabled"),
    },
  };
}

test("network recovery restores Compose service aliases", () => {
  assert.deepEqual(
    networkReconnectArguments("project_app", "abc123", {
      Aliases: ["server", "project-server-1", "server"],
    }),
    [
      "network",
      "connect",
      "--alias",
      "server",
      "--alias",
      "project-server-1",
      "project_app",
      "abc123",
    ],
  );
});

test("accepts only the expected nonzero doctor result during fault injection", () => {
  const report = { overall: "fail", checks: [] };
  assert.equal(
    extractDoctorReport(
      {
        result: { status: 4 },
        payload: {
          ok: false,
          error: { code: "SELF_HOST_DOCTOR_FAILED" },
          details: { doctor: report },
        },
      },
      { expectFailure: true },
    ),
    report,
  );
  assert.throws(
    () =>
      extractDoctorReport(
        {
          result: { status: 0 },
          payload: { ok: true, error: null, details: { doctor: report } },
        },
        { expectFailure: true },
      ),
    /expected blocking failure/,
  );
});

test("reserves distinct HTTP and HTTPS ports in one atomic window", async () => {
  let nextPort = 41_000;
  const closed = [];
  const createServer = () => {
    const port = nextPort++;
    return {
      once() {},
      listen(_requested, _host, callback) {
        callback();
      },
      address() {
        return { port };
      },
      close(callback) {
        closed.push(port);
        callback();
      },
    };
  };
  const ports = await reservePorts(2, createServer);
  assert.equal(ports.length, 2);
  assert.equal(new Set(ports).size, 2);
  assert.ok(ports.every((port) => Number.isSafeInteger(port) && port > 0));
  assert.deepEqual(closed.sort(), ports.toSorted());
});

test("port reservation preserves allocation and every close failure", async () => {
  const firstClose = new Error("first close failed");
  const secondClose = new Error("second close failed");
  let nextPort = 42_000;
  const createServer = () => {
    const port = nextPort++;
    const closeError = port === 42_000 ? firstClose : secondClose;
    return {
      once() {},
      listen(_requested, _host, callback) {
        callback();
      },
      address() {
        return { port };
      },
      close(callback) {
        callback(closeError);
      },
    };
  };
  await assert.rejects(reservePorts(2, createServer), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.deepEqual(error.errors, [firstClose, secondClose]);
    return true;
  });

  const allocation = new Error("second listen failed");
  const cleanup = new Error("first close failed after allocation");
  let created = 0;
  const createFailingServer = () => {
    const index = created++;
    let errorHandler;
    return {
      once(event, handler) {
        if (event === "error") errorHandler = handler;
      },
      listen(_requested, _host, callback) {
        if (index === 0) callback();
        else errorHandler(allocation);
      },
      address() {
        return { port: 43_000 };
      },
      close(callback) {
        callback(cleanup);
      },
    };
  };
  await assert.rejects(reservePorts(2, createFailingServer), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.equal(error.errors[0], allocation);
    assert.equal(error.errors[1] instanceof AggregateError, true);
    assert.deepEqual(error.errors[1].errors, [cleanup]);
    return true;
  });
});

test("rejects unbounded acceptance runner inputs", async (t) => {
  await assert.rejects(reservePorts(0), /count is invalid/);
  await assert.rejects(reservePorts(17), /count is invalid/);

  const directory = await fs.mkdtemp(resolve(tmpdir(), "acceptance-input-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, "record.json");
  await fs.writeFile(path, "{}\n");
  assert.deepEqual(await readAcceptanceJson(path, "fixture"), {});
  await assert.rejects(
    readAcceptanceJson(path, "fixture", { expectedBytes: 4 }),
    /not one bounded regular file/,
  );
  await fs.truncate(path, 1024 * 1024 + 1);
  await assert.rejects(
    readAcceptanceJson(path, "fixture"),
    /not one bounded regular file/,
  );
});

test("connected provider fixture switches from a tile response to a hang", async () => {
  let handler;
  let closed = false;
  const fixture = await startTileFixture({
    createServer(nextHandler) {
      handler = nextHandler;
      return {
        once() {},
        on() {},
        listen(_requested, _host, callback) {
          callback();
        },
        address() {
          return { port: 42_000 };
        },
        close(callback) {
          closed = true;
          callback();
        },
      };
    },
  });
  try {
    const writes = [];
    const response = {
      writeHead(status, headers) {
        writes.push({ status, headers });
        return this;
      },
      end(body) {
        writes.push(body);
      },
    };
    handler({ url: "/0/0/0.png" }, response);
    assert.equal(writes[0].status, 200);
    assert.ok(Buffer.isBuffer(writes[1]));
    fixture.hang();
    handler({ url: "/0/0/0.png" }, response);
    assert.equal(writes.length, 2);
  } finally {
    await fixture.stop();
  }
  assert.equal(closed, true);
});

test("extracts only the Better Auth session cookie", () => {
  const headers = new Headers();
  headers.append(
    "set-cookie",
    "better-auth.session_token=opaque.value; Path=/; HttpOnly; SameSite=Lax",
  );
  headers.append("set-cookie", "locale=en; Path=/");
  assert.equal(
    extractSessionCookie(headers),
    "better-auth.session_token=opaque.value",
  );
  assert.throws(
    () => extractSessionCookie(new Headers({ "set-cookie": "locale=en" })),
    /session cookie/,
  );
});

test("generates a real GPX activity with route and elevation records", async () => {
  const contents = createAcceptanceGpx("unit-fixture");
  const trackSwap = new TrackSwap();
  try {
    assert.equal(trackSwap.detect(contents), "gpx");
    const document = await trackSwap.decode(contents, { format: "gpx" });
    const activity = document.facets.activity?.activities?.[0];
    assert.equal(document.kinds.includes("activity"), true);
    assert.equal(activity?.laps?.[0]?.records?.length, 30);
    assert.equal(activity?.laps?.[0]?.records?.[0]?.altitude, 80);
  } finally {
    await trackSwap.dispose();
  }
  assert.throws(() => createAcceptanceGpx("../escape"), /suffix is invalid/);
});

test("requires the exact Core Local and Connected capability boundaries", () => {
  const core = capabilitySnapshot("core-local");
  assert.equal(validateRuntimeCapabilitySnapshot(core, "core-local"), core);
  const connected = capabilitySnapshot("connected");
  assert.equal(
    validateRuntimeCapabilitySnapshot(
      connected,
      "connected",
      connected.map.tileUrl,
    ),
    connected,
  );
  core.capabilities.ai.state = "enabled";
  assert.throws(
    () => validateRuntimeCapabilitySnapshot(core, "core-local"),
    /optional capability is not disabled/,
  );
  connected.map.attribution = "";
  assert.throws(
    () =>
      validateRuntimeCapabilitySnapshot(
        connected,
        "connected",
        connected.map.tileUrl,
      ),
    /map provider contract differs/,
  );
});
