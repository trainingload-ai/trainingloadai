import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire, Module } from "node:module";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
// Prisma decodes timestamp-without-time-zone as UTC. Match that contract in
// this PGlite bridge instead of the host-local PostgreSQL Date parser.
process.env.TZ = "UTC";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const file = fileURLToPath(
  new URL(
    "../../../../apps/server/src/integrations/external-provider/external-provider-webhook-inbox.service.ts",
    import.meta.url,
  ),
);
const generated = require("../../generated/core");
const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
  },
}).outputText;
const loaded = new Module(file);
loaded.paths = Module._nodeModulePaths(dirname(file));
loaded.require = (id) =>
  id === "@prisma/client"
    ? generated
    : id === "@/prisma/prisma.service"
      ? { PrismaService: class {} }
      : id === "./external-provider-webhook-signal.service"
        ? { ExternalProviderWebhookSignalService: class {} }
        : Module.prototype.require.call(loaded, id);
loaded._compile(compiled, file);
const { ExternalProviderWebhookInboxService } = loaded.exports;

function loadTypeScript(relative, bindings = {}) {
  const filename = fileURLToPath(new URL(relative, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const module = new Module(filename);
  module.paths = Module._nodeModulePaths(dirname(filename));
  module.require = (id) =>
    Object.hasOwn(bindings, id)
      ? bindings[id]
      : Module.prototype.require.call(module, id);
  module._compile(compiled, filename);
  return module.exports;
}

test("existing inbox SQL fences deferral, preserves payload, and leaves local/other-provider work runnable", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      `CREATE TYPE enum_third_party_provider AS ENUM ('garmin','coros'); CREATE TABLE t_external_provider_webhook_event(id text PRIMARY KEY,provider enum_third_party_provider,event_type text,external_user_id text,status text,available_at timestamp(3),attempts int,locked_at timestamp(3),processed_at timestamp(3),last_error text,payload jsonb,updated_at timestamp(3));`,
    );
    const lockedAt = new Date(Math.floor(Date.now() / 1000) * 1000),
      until = new Date(Date.now() + 120000);
    const add = (id, provider, type, status, attempts = 0) =>
      db.query(
        "INSERT INTO t_external_provider_webhook_event VALUES($1,$2,$3,$4,$5,now(),$6,$7,NULL,NULL,$8::jsonb,now())",
        [
          id,
          provider,
          type,
          "account",
          status,
          attempts,
          lockedAt,
          JSON.stringify({ ciphertext: "encrypted-source" }),
        ],
      );
    await add("current", "garmin", "activityFiles", "PROCESSING", 8);
    await add("pending", "garmin", "activityFiles", "PENDING");
    await add("health", "garmin", "dailies", "PENDING");
    await add("other", "coros", "activityFiles", "PENDING");
    const prisma = {
      $executeRaw: async (q) => (await db.query(q.text, q.values)).affectedRows,
      externalProviderWebhookEvent: {
        findFirst: async (a) => {
          const scopes = a.where.OR.map((value) => value.payload.equals);
          const result = await db.query(
            "SELECT max(available_at) AS \"availableAt\" FROM t_external_provider_webhook_event WHERE provider=$1 AND status IN ('PENDING','FAILED','PROCESSING') AND last_error='PROVIDER_RATE_LIMITED' AND available_at>$2 AND (payload#>>'{__rateLimit,scopeKey}')=ANY($3::text[])",
            [a.where.provider, a.where.availableAt.gt, scopes],
          );
          return result.rows[0]?.availableAt ? result.rows[0] : null;
        },
      },
    };
    const service = new ExternalProviderWebhookInboxService(prisma);
    assert.equal(
      await service.defer({
        id: "current",
        attempts: 8,
        lockedAt,
        until,
        scopeKey: "app:test",
      }),
      1,
    );
    let row = (
      await db.query(
        "SELECT * FROM t_external_provider_webhook_event WHERE id='current'",
      )
    ).rows[0];
    assert.equal(row.status, "PENDING");
    assert.equal(row.attempts, 7);
    assert.equal(row.payload.ciphertext, "encrypted-source");
    assert.equal(row.payload.__rateLimit.count, 1);
    await db.query(
      "UPDATE t_external_provider_webhook_event SET status='PROCESSING',attempts=8,locked_at=$1 WHERE id='current'",
      [new Date(lockedAt.getTime() + 1000)],
    );
    assert.equal(
      await service.defer({
        id: "current",
        attempts: 8,
        lockedAt,
        until,
        scopeKey: "app:test",
      }),
      0,
    );
    await add("scoped", "garmin", "activityFiles", "PENDING");
    await db.query(
      "UPDATE t_external_provider_webhook_event SET external_user_id='another-account' WHERE id='scoped'",
    );
    await service.pausePending({
      provider: "garmin",
      until,
      scopeKey: "account:test",
      eventTypes: ["activityFiles"],
      externalUserId: "another-account",
    });
    assert.equal(
      (
        await db.query(
          "SELECT last_error FROM t_external_provider_webhook_event WHERE id='pending'",
        )
      ).rows[0].last_error,
      null,
    );
    assert.equal(
      (
        await db.query(
          "SELECT payload#>>'{__rateLimit,scopeKey}' AS scope FROM t_external_provider_webhook_event WHERE id='scoped'",
        )
      ).rows[0].scope,
      "account:test",
    );
    await service.pausePending({
      provider: "garmin",
      until,
      scopeKey: "app:test",
      eventTypes: ["activityFiles"],
    });
    const records = (
      await db.query(
        "SELECT id,last_error FROM t_external_provider_webhook_event",
      )
    ).rows;
    assert.equal(
      records.find((r) => r.id === "pending").last_error,
      "PROVIDER_RATE_LIMITED",
    );
    assert.equal(records.find((r) => r.id === "health").last_error, null);
    assert.equal(records.find((r) => r.id === "other").last_error, null);
    assert.ok(
      await new ExternalProviderWebhookInboxService(prisma).rateLimitUntil(
        "garmin",
        ["app:test"],
      ),
    );
    assert.equal(await service.rateLimitUntil("coros", ["app:test"]), null);
  } finally {
    await db.close();
  }
});

test("claimed batch and newly arrived jobs honor a durable cooldown after dispatcher restart", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE TYPE enum_third_party_provider AS ENUM ('garmin','coros');
      CREATE TABLE t_external_provider_webhook_event(id text PRIMARY KEY,provider enum_third_party_provider NOT NULL,event_type text NOT NULL,external_user_id text,status text NOT NULL,available_at timestamp(3) NOT NULL DEFAULT now(),attempts int NOT NULL DEFAULT 0,locked_at timestamp(3),processed_at timestamp(3),last_error text,payload jsonb NOT NULL,updated_at timestamp(3) NOT NULL DEFAULT now(),received_at timestamp(3) NOT NULL DEFAULT now());`);
    const add = (id, type, provider = "garmin") =>
      db.query(
        "INSERT INTO t_external_provider_webhook_event(id,provider,event_type,external_user_id,status,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
        [
          id,
          provider,
          type,
          "account",
          "PENDING",
          JSON.stringify({ ciphertext: "encrypted-source" }),
        ],
      );
    const prisma = {
      $executeRaw: async (q) => {
        const result = await db.query(q.text, q.values);
        if (q.text.includes("locked_at=")) {
          assert.equal(
            result.affectedRows,
            1,
            "a live claim must be released exactly once",
          );
        }
        return result.affectedRows;
      },
      $queryRawUnsafe: async (sql, ...values) =>
        (await db.query(sql, values)).rows,
      externalProviderWebhookEvent: {
        count: async (a) =>
          Number(
            (
              await db.query(
                "SELECT count(*) AS count FROM t_external_provider_webhook_event WHERE provider=$1 AND status=ANY($2::text[])",
                [a.where.provider, a.where.status.in],
              )
            ).rows[0].count,
          ),
        update: async (a) =>
          db.query(
            "UPDATE t_external_provider_webhook_event SET status=$2,processed_at=$3,locked_at=$4,last_error=$5 WHERE id=$1",
            [
              a.where.id,
              a.data.status,
              a.data.processedAt,
              a.data.lockedAt,
              a.data.lastError,
            ],
          ),
        findFirst: async (a) => {
          const row = (
            await db.query(
              `SELECT max(available_at) AS "availableAt" FROM t_external_provider_webhook_event WHERE provider=$1 AND status=ANY($2::text[]) AND last_error='PROVIDER_RATE_LIMITED' AND available_at>$3 AND (payload#>>'{__rateLimit,scopeKey}')=ANY($4::text[])`,
              [
                a.where.provider,
                a.where.status.in,
                a.where.availableAt.gt,
                a.where.OR.map((v) => v.payload.equals),
              ],
            )
          ).rows[0];
          return row?.availableAt ? row : null;
        },
      },
    };
    const { WorkerDrainProgress } = loadTypeScript(
      "../../../../apps/server/src/workers/worker-drain-progress.ts",
    );
    const { ExternalProviderWebhookDispatcherService: Dispatcher } =
      loadTypeScript(
        "../../../../apps/server/src/integrations/external-provider/external-provider-webhook-dispatcher.service.ts",
        {
          "@/workers/worker-drain-progress": { WorkerDrainProgress },
          "./external-provider-webhook-inbox.service": {
            ExternalProviderWebhookInboxService,
          },
          "./external-provider-webhook-signal.service": {
            ExternalProviderWebhookSignalService: class {},
          },
          "@/runtime-capabilities/runtime-capability.service": {
            RuntimeCapabilityService: class {},
          },
        },
      );
    const scopeKey = "app:fixture",
      until = new Date(Date.now() + 120000);
    let outboundCalls = 0,
      rejected = false,
      localCalls = 0;
    const start = () => {
      const inbox = new ExternalProviderWebhookInboxService(prisma);
      const dispatcher = new Dispatcher(
        { get: () => undefined },
        inbox,
        {},
        { isEnabled: () => false },
      );
      dispatcher.register({
        provider: "garmin",
        label: "fixture",
        process: async (event) => {
          if (event.event_type === "dailies") {
            localCalls++;
            return "DONE";
          }
          const current = await inbox.rateLimitUntil("garmin", [scopeKey]);
          if (current) return { deferUntil: current, scopeKey };
          outboundCalls++;
          if (!rejected) {
            rejected = true;
            await inbox.pausePending({
              provider: "garmin",
              until,
              scopeKey,
              eventTypes: ["activityFiles"],
            });
            return { deferUntil: until, scopeKey };
          }
          return "DONE";
        },
      });
      dispatcher.register({
        provider: "coros",
        label: "fixture other",
        process: async () => {
          localCalls++;
          return "DONE";
        },
      });
      return dispatcher;
    };
    await add("first", "activityFiles");
    await add("already-claimed", "activityFiles");
    await add("local", "dailies");
    await add("other-provider", "activityFiles", "coros");
    await start().drainAll();
    assert.equal(outboundCalls, 1);
    assert.equal(localCalls, 2);
    const rows = (
      await db.query(
        "SELECT status,attempts,payload FROM t_external_provider_webhook_event WHERE event_type='activityFiles' AND provider='garmin'",
      )
    ).rows;
    assert.ok(
      rows.every(
        (row) =>
          row.status === "PENDING" &&
          row.attempts === 0 &&
          row.payload.ciphertext === "encrypted-source",
      ),
    );
    await add("new-after-restart", "activityFiles");
    await start().drainAll();
    assert.equal(outboundCalls, 1);
    const waiting = (
      await db.query(
        "SELECT count(*) AS count FROM t_external_provider_webhook_event WHERE last_error='PROVIDER_RATE_LIMITED' AND status='PENDING'",
      )
    ).rows[0].count;
    assert.equal(Number(waiting), 3);
    // Advance the persisted deadlines without blocking the test or worker.
    await db.query(
      "UPDATE t_external_provider_webhook_event SET available_at=now()-interval '1 second' WHERE status='PENDING'",
    );
    await start().drainAll();
    assert.equal(outboundCalls, 4);
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) AS count FROM t_external_provider_webhook_event WHERE status<>'DONE'",
          )
        ).rows[0].count,
      ),
      0,
    );
  } finally {
    await db.close();
  }
});
