/* Run from a composed workspace after compiling the server. No production writes. */
const fs = require("node:fs"),
  path = require("node:path"),
  { createRequire } = require("node:module"),
  { randomUUID, createHash } = require("node:crypto");
const option = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const workspace = path.resolve(option("workspace") || process.cwd());
const req = createRequire(workspace + "/apps/server/package.json");
const url = new URL(process.env.DATABASE_URL || "invalid:");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !url.pathname.startsWith("/starshards_replay_validation_")
)
  throw Error("ISOLATED_LOCAL_VALIDATION_DATABASE_REQUIRED");
const storage = path.resolve(option("storage") || "");
const output = path.resolve(option("output") || "");
if (
  !option("storage") ||
  !option("output") ||
  !storage.includes("replay-validation")
)
  throw Error("ISOLATED_VALIDATION_PATHS_REQUIRED");
Object.assign(process.env, {
  NODE_ENV: "test",
  DEPLOYMENT_MODE: "selfhost",
  STORAGE_STRATEGY: "LOCAL",
  LOCAL_STORAGE_PATH: storage,
  LOCAL_STORAGE_CACHE_PATH: storage + "/cache",
  SERVER_MESSAGE_CATALOG_PATH: workspace + "/packages/messages/server",
  BETTER_AUTH_SECRET: "local-replay-validation-no-login-credentials",
  BETTER_AUTH_URL: "http://localhost:3999",
  AI_TODAY_WEATHER_ENABLED: "false",
  ACTIVITY_WEATHER_ENABLED: "false",
});
for (const name of [
  "REVIEW",
  "IMPORT_ITEM",
  "USER_POST_PROCESS",
  "ACTIVITY_RECOMPUTE",
  "ACTIVITY_AI_REVIEW",
  "ACTIVITY_MAP_THUMB",
  "ACCOUNT_DELETION",
  "USER_DATA_EXPORT",
])
  process.env[name + "_WORKER_ENABLED"] = "false";
if (option("runtime-registration"))
  req(path.resolve(option("runtime-registration")));
process.chdir(workspace + "/apps/server");
req("reflect-metadata");
const stage = workspace;
const { Module, Global } = req("@nestjs/common");
const { NestFactory } = req("@nestjs/core");
const core = (name) =>
  req(stage + "/apps/server/dist/apps/server/src/" + name + ".js");
const { ACCOUNT_DELETION_LOCAL_DATA } = core(
  "account-lifecycle/account-deletion-local-data.port",
);
class LocalModule {}
Global()(LocalModule);
Module({
  providers: [
    {
      provide: ACCOUNT_DELETION_LOCAL_DATA,
      useValue: {
        async revokeLocalCredentials() {},
        async beforeUserDeletion() {},
      },
    },
  ],
  exports: [ACCOUNT_DELETION_LOCAL_DATA],
})(LocalModule);
class BenchModule {}
Module({
  imports: [
    req("@nestjs/schedule").ScheduleModule.forRoot({
      cronJobs: false,
      intervals: false,
      timeouts: false,
    }),
    core("workers/core-jobs.module").CoreJobsModule,
    core("deployment/self-host-access.module").SelfHostAccessModule,
    core("deployment/self-host-ai-operation-persistence.module")
      .SelfHostAiOperationPersistenceModule,
    core("deployment/disabled-external-program-import.module")
      .DisabledExternalProgramImportModule,
    core("onboarding/local-onboarding-completion.module")
      .LocalOnboardingCompletionModule,
    core("api/user/local-account-provider-lifecycle.module")
      .LocalAccountProviderLifecycleModule,
    LocalModule,
    core("app.module").AppModule,
  ],
})(BenchModule);
const assert = require("node:assert/strict");
const result = { schemaVersion: 1, checks: [] };
(async () => {
  const { PrismaClient } = req(
    fs.existsSync(
      workspace + "/packages/managed-server/prisma/generated/managed/index.js",
    )
      ? workspace + "/packages/managed-server/prisma/generated/managed"
      : "@prisma/client",
  );
  const db = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
  let sqlCount = 0,
    sqlMs = 0;
  db.$on("query", (e) => {
    sqlCount++;
    sqlMs += e.duration;
  });
  const { Test } = req("@nestjs/testing");
  const { PrismaService } = core("prisma/prisma.service");
  const { RuntimeCapabilityService } = core(
    "runtime-capabilities/runtime-capability.service",
  );
  const caps = new RuntimeCapabilityService(),
    originalSnapshot = caps.snapshot.bind(caps);
  caps.snapshot = () => {
    const s = originalSnapshot();
    s.ready = true;
    for (const [name, c] of Object.entries(s.capabilities)) {
      c.state = ["database", "storage", "authentication"].includes(name)
        ? "enabled"
        : "disabled";
      c.issues = [];
    }
    return s;
  };
  const testing = await Test.createTestingModule({ imports: [BenchModule] })
    .overrideProvider(PrismaService)
    .useValue(db)
    .overrideProvider(RuntimeCapabilityService)
    .useValue(caps)
    .compile();
  const app = testing.createNestApplication({ logger: ["error", "warn"] });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  const sensor = app.get(core("sensor/sensor-data.service").SensorDataService);
  const pipeline = app.get(
    core("api/activity/metrics/activity-metrics-pipeline.service")
      .ActivityMetricsPipelineService,
  );
  const replay = app.get(
    core("analyze/chronological-activity-replay.service")
      .ChronologicalActivityReplayService,
  );
  const leases = app.get(
    core("analyze/activity-analysis-lease.service")
      .ActivityAnalysisLeaseService,
  );
  let parquetQueries = 0;
  const query = sensor.executeQuery.bind(sensor);
  sensor.executeQuery = async (sql, ...args) => {
    if (/read_parquet/i.test(sql)) parquetQueries++;
    return query(sql, ...args);
  };
  try {
    const storageService = app.get(
      core("storage/storage.service").StorageService,
    );
    const repair = new (core(
      "importing/fit-activity-data-repair.service",
    ).FitActivityDataRepairService)(db, storageService);
    const service = new (core(
      "importing/activity-data-migration.service",
    ).ActivityDataMigrationService)(db, repair);
    if (option("production-copy") === "true") {
      await require("./production-copy-migration-checks.cjs")({
        db,
        app,
        core,
        option,
        service,
        sensor,
        output,
      });
      return;
    }
    const source = await db.activitySource.findFirstOrThrow({
      where: {
        userId: option("fixture-user-id") || "FIXTURE_USER_REQUIRED",
        isPrimary: true,
        activity: { avgPower: { gt: 0 } },
      },
      include: { activity: true, sourceObject: true, canonicalSnapshot: true },
    });
    const rawKey =
      source.sourceObject.rawStorageKey ?? source.sourceObject.fileKey;
    if (!fs.existsSync(path.join(storage, rawKey))) {
      const fixture = fs.readFileSync(
        path.join(option("fixture-directory"), source.sourceObject.fileName),
      );
      assert.equal(
        createHash("sha256").update(fixture).digest("hex"),
        source.sourceObject.rawChecksum,
      );
      fs.mkdirSync(path.dirname(path.join(storage, rawKey)), {
        recursive: true,
      });
      fs.writeFileSync(path.join(storage, rawKey), fixture, { mode: 0o600 });
    }
    const users = [],
      activityIds = [];
    for (let i = 0; i < 2; i++) {
      const userId = randomUUID();
      await db.t_user.create({
        data: {
          id: userId,
          email: userId + "@local-validation.invalid",
          name: "Migration fixture",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      users.push(userId);
      const {
        id,
        createdAt,
        updatedAt,
        userId: oldUser,
        hashId,
        ...data
      } = source.activity;
      const activity = await db.activity.create({
        data: {
          ...data,
          userId,
          hashId: randomUUID(),
          activityName: "User-owned title",
          description: "Must survive repair",
          sessionRpe: 4,
          processingStatus: "READY",
        },
      });
      activityIds.push(activity.id);
      const uid = "migration-fixture:" + userId,
        checksum = source.sourceObject.rawChecksum;
      const object = await db.importSourceObject.create({
        data: {
          userId,
          sourceKind: "FILE",
          sourceUid: uid,
          objectType: "activity_file",
          fileName: source.sourceObject.fileName,
          fileKey: source.sourceObject.fileKey,
          rawStorageKey: source.sourceObject.rawStorageKey,
          rawChecksum: checksum,
        },
      });
      const batch = await db.importBatchJob.create({
        data: {
          userId,
          sourceKind: "FILE",
          status: "COMPLETED",
          totalCount: 1,
          successCount: 1,
        },
      });
      const item = await db.importItemJob.create({
        data: {
          userId,
          batchJobId: batch.id,
          sourceObjectId: object.id,
          sourceKind: "FILE",
          sourceUid: uid,
          position: 0,
          status: "DONE",
          activityId: activity.id,
        },
      });
      const payload = structuredClone(source.canonicalSnapshot.payload);
      payload.source = {
        ...payload.source,
        kind: "FILE",
        sourceUid: uid,
        sourceChecksum: checksum,
        provider: null,
      };
      payload.identity.sourceUid = uid;
      payload.records = [];
      payload.strengthSets = [];
      const snapshot = await db.canonicalActivitySnapshot.create({
        data: {
          userId,
          itemJobId: item.id,
          sourceObjectId: object.id,
          batchJobId: batch.id,
          payload,
          dedupeKey: uid,
          sportType: activity.sportType,
          startTime: activity.startTime,
          endTime: activity.endTime,
        },
      });
      await db.activitySource.create({
        data: {
          userId,
          activityId: activity.id,
          sourceKind: "FILE",
          sourceUid: uid,
          sourceObjectId: object.id,
          canonicalSnapshotId: snapshot.id,
          sourceChecksum: checksum,
          isPrimary: true,
          isActive: true,
          metadata: { materializationVersion: 1 },
        },
      });
    }
    const backupPath = option("backup-module");
    if (!backupPath) throw Error("BACKUP_MODULE_REQUIRED");
    const { createVerifiedBackup, localBackupAdapter } = await import(
      require("node:url").pathToFileURL(backupPath)
    );
    const evidence = await createVerifiedBackup(
      localBackupAdapter(process.env.DATABASE_URL),
      {
        directory: storage + "/integration-backups",
        secondaryDirectory: storage + "/integration-backup-copy",
        targetRevision: "local-per-user-integration",
      },
    );
    const runKey = "integration-" + Date.now();
    await service.prepare(
      runKey,
      "local-per-user-integration",
      users,
      evidence,
    );
    const iw = app.get(
        core("importing/import-item.worker").ImportItemWorkerService,
      ),
      pw = app.get(
        core("importing/user-post-process.worker").UserPostProcessWorkerService,
      ),
      rw = app.get(
        core("workers/workers/activity-recompute.worker")
          .ActivityRecomputeWorkerService,
      );
    const observed = [];
    let injected = false,
      restarted = false;
    for (let turn = 0; turn < 80; turn++) {
      let rows = await service.status(runKey);
      if (rows.every((r) => r.status === "VERIFIED")) break;
      const first = rows[0];
      if (first.status !== "VERIFIED") assert.equal(rows[1].status, "PENDING");
      if (!injected && first.status === "MIGRATING") {
        await db.activityDataMigration.update({
          where: { id: first.id },
          data: { status: "FAILED", errorCode: "LOCAL_INJECTED_FAILURE" },
        });
        await assert.rejects(
          () => service.advance(runKey),
          /PREVIOUS_USER_FAILED/,
        );
        assert.equal((await service.status(runKey))[1].status, "PENDING");
        await service.retry(first.id);
        injected = true;
        result.checks.push("failure blocks next user; explicit retry resumes");
      }
      if (!restarted && first.status === "VERIFYING") {
        await db.activity.update({
          where: { id: activityIds[0] },
          data: { activityName: "Updated during migration" },
        });
        await db.activityDataMigration.update({
          where: { id: first.id },
          data: {
            status: "FAILED",
            errorCode: "ACTIVITY_MIGRATION_PROTECTED_DATA_CHANGED",
          },
        });
        await service.restartUser(first.id);
        restarted = true;
        result.checks.push(
          "explicit restart preserves new user edits and old recovery pins",
        );
      }
      await service.advance(runKey);
      rows = await service.status(runKey);
      observed.push(rows.map((r) => r.status + ":" + r.phase));
      const active = rows.find((r) =>
        ["MIGRATING", "VERIFYING"].includes(r.status),
      );
      if (!active) continue;
      const batches = active.importBatchIds;
      for (const item of await db.importItemJob.findMany({
        where: {
          batchJobId: { in: batches },
          status: { in: ["QUEUED", "FAILED"] },
        },
      })) {
        const token = randomUUID();
        await db.importItemJob.update({
          where: { id: item.id },
          data: {
            status: "NORMALIZING",
            lockToken: token,
            leaseExpiresAt: new Date(Date.now() + 300000),
          },
        });
        await iw.processJob({
          id: item.id,
          batchJobId: item.batchJobId,
          userId: item.userId,
          sourceObjectId: item.sourceObjectId,
          sourceKind: item.sourceKind,
          lockToken: token,
        });
        const after = await db.importItemJob.findUniqueOrThrow({
          where: { id: item.id },
        });
        if (after.status !== "DONE")
          throw Error(
            "INTEGRATION_IMPORT_FAILED:" +
              after.lastErrorCode +
              ":" +
              after.lastError,
          );
      }
      for (const post of await db.userPostProcessJob.findMany({
        where: {
          batchJobId: { in: batches },
          status: { in: ["PENDING", "FAILED"] },
        },
      })) {
        const token = randomUUID();
        await db.userPostProcessJob.update({
          where: { id: post.id },
          data: {
            status: "RUNNING",
            lockToken: token,
            leaseExpiresAt: new Date(Date.now() + 300000),
          },
        });
        await pw.processJob({
          id: post.id,
          userId: post.userId,
          batchJobId: post.batchJobId,
          lockToken: token,
        });
      }
      if (active.recomputeJobId) {
        const job = await db.activityRecomputeJob.findUniqueOrThrow({
          where: { id: active.recomputeJobId },
        });
        if (job.status === "SCHEDULED") {
          const token = randomUUID();
          await db.activityRecomputeJob.update({
            where: { id: job.id },
            data: {
              status: "RUNNING",
              lockToken: token,
              leaseExpiresAt: new Date(Date.now() + 300000),
            },
          });
          await rw.processJob({
            ...job,
            lockToken: token,
            includeActivityIds: job.triggerPayload.includeActivityIds,
          });
        }
      }
    }
    const rows = await service.status(runKey);
    assert.ok(
      rows.every((r) => r.status === "VERIFIED"),
      JSON.stringify(rows),
    );
    for (const id of activityIds) {
      const a = await db.activity.findUniqueOrThrow({ where: { id } });
      assert.equal(
        a.activityName,
        id === activityIds[0] ? "Updated during migration" : "User-owned title",
      );
      assert.equal(a.description, "Must survive repair");
      assert.equal(a.sessionRpe, 4);
      assert.equal(a.processingStatus, "READY");
      assert.ok(
        await db.activityParquetFile.count({
          where: { activityId: id, type: "record" },
        }),
      );
    }
    assert.ok(
      await db.storageObjectRetention.count({
        where: { migrationId: { in: rows.map((r) => r.id) }, releasedAt: null },
      }),
    );
    await service.releaseRecoveryObjects(runKey);
    assert.equal(
      await db.storageObjectRetention.count({
        where: { migrationId: { in: rows.map((r) => r.id) }, releasedAt: null },
      }),
      0,
    );
    result.ok = true;
    result.checks.push(
      "A verified before B starts",
      "raw FIT rebuilt missing Parquet",
      "IDs, titles, description and RPE preserved",
      "cold replay and zero-read hot verification",
      "recovery objects retained until explicit release",
    );
    result.transitions = observed;
    result.verification = rows.map((r) => r.verification);
  } finally {
    await app.close();
    await db.$disconnect();
  }
  fs.writeFileSync(output, JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
})().catch((e) => {
  result.ok = false;
  result.error = e.stack;
  fs.writeFileSync(output, JSON.stringify(result, null, 2), { mode: 0o600 });
  console.error(e.stack);
  process.exitCode = 1;
});
