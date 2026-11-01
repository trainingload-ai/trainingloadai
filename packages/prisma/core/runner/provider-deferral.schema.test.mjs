import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire, Module } from "node:module";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
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
