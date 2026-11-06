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
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  environment: { node: process.version },
  profile: option("profile") || "mixed-record-length",
  scenarios: [],
  checks: [],
};
const percentile = (values, q) =>
  values.length
    ? values.toSorted((a, b) => a - b)[
        Math.min(values.length - 1, Math.ceil(values.length * q) - 1)
      ]
    : null;
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
    report.environment.databaseVersion = (
      await db.$queryRawUnsafe("SELECT version() AS version")
    )[0].version;
    const sizes = (option("sizes") || "44,308,391,500,2000")
      .split(",")
      .map(Number);
    if (sizes.some((n) => !Number.isInteger(n) || n < 1 || n > 2000))
      throw Error("BENCHMARK_SIZE_INVALID");
    const batch = "bench-" + Date.now();
    let caseIndex = 0;
    const templates = new Map();
    for (const count of sizes) {
      const userId = randomUUID();
      await db.t_user.create({
        data: {
          id: userId,
          email: userId + "@local-validation.invalid",
          name: "Replay benchmark",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const prepared = Date.now(),
        ids = [];
      let recordPoints = 0;
      const start0 = new Date(Date.now() - count * 43200000 - 86400000);
      for (let i = 0; i < count; i++) {
        const startTime = new Date(start0.getTime() + i * 43200000);
        const points =
          option("profile") === "high-frequency"
            ? 14540
            : i % 20 === 19
              ? 12625
              : 2641;
        recordPoints += points;
        const endTime = new Date(startTime.getTime() + (points - 1) * 1000);
        let template = templates.get(points);
        if (!template) {
          const existing = await db.activity.findFirst({
            where: {
              activityName: "Local synthetic cycling",
              parquetFiles: { some: { pointCount: points } },
            },
            include: { parquetFiles: true },
          });
          if (existing) {
            const { parquetFiles, ...facts } = existing;
            const file = parquetFiles.find((f) => f.type === "record");
            const low = {};
            for (const model of [
              "activityPeakMetric",
              "activityLthrObservation",
              "activityPerformanceTT",
            ])
              low[model] = await db[model].findMany({
                where: { activityId: existing.id },
              });
            template = { facts, file, low };
            templates.set(points, template);
          }
        }
        let activity;
        if (template) {
          const { id: oldId, createdAt, updatedAt, ...facts } = template.facts;
          activity = await db.activity.create({
            data: {
              ...facts,
              userId,
              hashId: randomUUID(),
              startTime,
              endTime,
              processingStatus: "ANALYZING",
            },
          });
          const key =
              "private/benchmark/" + batch + "/" + activity.id + ".parquet",
            destination = path.join(storage, key);
          fs.mkdirSync(path.dirname(destination), {
            recursive: true,
            mode: 0o700,
          });
          const original = path.join(storage, template.file.parquetPath),
            offset = startTime.getTime() - template.facts.startTime.getTime();
          const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
          await query(
            `COPY (SELECT * REPLACE(timestamp + INTERVAL '${offset} milliseconds' AS timestamp, ${activity.id} AS activityId, ${quote(activity.hashId)} AS hashId) FROM read_parquet(${quote(original)})) TO ${quote(destination)} (FORMAT PARQUET)`,
          );
          const bytes = fs.readFileSync(destination);
          await db.activityParquetFile.create({
            data: {
              activityId: activity.id,
              type: "record",
              parquetPath: key,
              pointCount: points,
              storageStrategy: "LOCAL",
              fileSize: bytes.length,
              checksum: createHash("md5").update(bytes).digest("hex"),
            },
          });
          for (const [model, rows] of Object.entries(template.low)) {
            if (!rows.length) continue;
            await db[model].createMany({
              data: rows.map((row) => {
                const { id, createdAt, updatedAt, ...data } = row;
                return { ...data, activityId: activity.id };
              }),
            });
          }
        } else {
          activity = await db.activity.create({
            data: {
              userId,
              hashId: randomUUID(),
              activityName: "Local synthetic cycling",
              sportType: "CYCLING",
              startTime,
              endTime,
              timezone: "Asia/Shanghai",
              elapsedTime: points,
              timerTime: points,
              distance: points * 7,
              state: 1,
              processingStatus: "ANALYZING",
              avgHeartRate: 132,
              maxHeartRate: 180,
            },
          });
          const records = Array.from({ length: points }, (_, j) => ({
            timestamp: new Date(startTime.getTime() + j * 1000),
            heartRate: 120 + Math.round(35 * Math.sin(j / 300) ** 2),
            power: j % 60 < 8 ? 0 : 150 + Math.round(40 * Math.sin(j / 90)),
            cadence: j % 60 < 8 ? 0 : 82,
            distance: j * 7,
            speed: 7,
          }));
          await sensor.storeSensorData(activity, records);
          await pipeline.runByMode({ activity, userId, mode: "light" });
          const file = await db.activityParquetFile.findFirstOrThrow({
            where: { activityId: activity.id, type: "record" },
          });
          const low = {};
          for (const model of [
            "activityPeakMetric",
            "activityLthrObservation",
            "activityPerformanceTT",
          ])
            low[model] = await db[model].findMany({
              where: { activityId: activity.id },
            });
          templates.set(points, {
            facts: await db.activity.findUniqueOrThrow({
              where: { id: activity.id },
            }),
            file,
            low,
          });
        }
        ids.push(activity.id);
        if (i % 100 === 99)
          console.log(
            JSON.stringify({
              phase: "seed",
              count,
              done: i + 1,
              elapsedMs: Date.now() - prepared,
            }),
          );
      }
      const seedMs = Date.now() - prepared;
      for (const label of ["cold", "hot", "hot-repeat"]) {
        const token = randomUUID(),
          job = await db.activityRecomputeJob.create({
            data: {
              dedupeKey: batch + ":" + caseIndex + ":" + label,
              userId,
              metricType: "DATA_REPAIR",
              reason: "LOCAL_BENCHMARK",
              affectedPipelines: ["FULL"],
              recomputeFrom: start0,
              recomputeTo: new Date(),
              lookbackDays: 0,
              availableAt: new Date(),
              status: "RUNNING",
              lockToken: token,
              leaseExpiresAt: new Date(Date.now() + 3600000),
              priority: 10,
            },
          });
        const start = performance.now(),
          cpu = process.cpuUsage(),
          sql0 = sqlCount,
          sqlMs0 = sqlMs,
          pq0 = parquetQueries,
          latencies = [],
          pages = [],
          pageDurations = [];
        let peakRss = process.memoryUsage().rss,
          peakConnections = 0,
          observeBusy = false;
        const timer = setInterval(() => {
          peakRss = Math.max(peakRss, process.memoryUsage().rss);
          if (observeBusy) return;
          observeBusy = true;
          const t = performance.now();
          Promise.all([
            fetch(`http://127.0.0.1:${address.port}/api/health/ready`).then(
              (r) => {
                if (r.status !== 200) throw Error("BENCHMARK_API_NOT_READY");
                latencies.push(performance.now() - t);
              },
            ),
            db
              .$queryRawUnsafe(
                "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()",
              )
              .then((rows) => {
                peakConnections = Math.max(peakConnections, rows[0].n);
              }),
          ])
            .catch((e) => report.checks.push({ ok: false, error: e.message }))
            .finally(() => {
              observeBusy = false;
            });
        }, 100);
        try {
          let from = start0;
          while (true) {
            const pageStarted = performance.now();
            const result = await replay.replay({
              userId,
              sourceJobType: "ACTIVITY_RECOMPUTE",
              sourceJobId: job.id,
              effectiveFrom: from,
              effectiveTo: new Date(),
              includeActivityIds: ids,
              dataRepair: true,
              priority: 10,
              sourceLockToken: token,
              suppressAthleteStateReassessment: true,
              maxActivities: 100,
            });
            pageDurations.push(performance.now() - pageStarted);
            pages.push(result);
            if (result.completed) break;
            const durable = await db.activityRecomputeJob.findUniqueOrThrow({
              where: { id: job.id },
              select: { replayCheckpoint: true },
            });
            if (
              durable.replayCheckpoint.nextEffectiveFrom !==
              result.nextCheckpoint.nextEffectiveFrom
            )
              throw Error("CHECKPOINT_NOT_DURABLE");
            from = new Date(durable.replayCheckpoint.nextEffectiveFrom);
          }
        } finally {
          clearInterval(timer);
          while (observeBusy) await new Promise((r) => setTimeout(r, 10));
        }
        const usage = process.cpuUsage(cpu);
        const item = {
          count,
          recordPoints,
          label,
          seedMs,
          pageP50Ms: percentile(pageDurations, 0.5),
          pageP95Ms: percentile(pageDurations, 0.95),
          durationMs: performance.now() - start,
          pages: pages.length,
          processedActivities: pages.reduce(
            (s, p) => s + p.processedActivities,
            0,
          ),
          highFrequencyReads: pages.reduce(
            (s, p) => s + p.highFrequencyReads,
            0,
          ),
          fingerprintHits: pages.reduce((s, p) => s + p.fingerprintHits, 0),
          sqlQueries: sqlCount - sql0,
          sqlDurationMs: sqlMs - sqlMs0,
          parquetQueries: parquetQueries - pq0,
          peakConnections,
          peakRssMiB: peakRss / 1048576,
          cpuSeconds: (usage.user + usage.system) / 1000000,
          apiP50Ms: percentile(latencies, 0.5),
          apiP95Ms: percentile(latencies, 0.95),
          apiSamples: latencies.length,
        };
        if (item.processedActivities !== count)
          throw Error("BENCHMARK_LOST_ACTIVITY");
        if (
          label.startsWith("hot") &&
          (item.highFrequencyReads !== 0 ||
            item.parquetQueries !== 0 ||
            item.fingerprintHits !== count)
        )
          throw Error("BENCHMARK_HOT_PARQUET_READ");
        await db.activityRecomputeJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", lockToken: null, leaseExpiresAt: null },
        });
        report.scenarios.push(item);
        fs.writeFileSync(output, JSON.stringify(report, null, 2), {
          mode: 0o600,
        });
        console.log(JSON.stringify(item));
      }
      // Exercise real PostgreSQL capacity and user fencing without running extra HEAVY.
      const a = await leases.acquire({
        userId,
        sourceJobType: "ACTIVITY_RECOMPUTE",
        sourceJobId: batch,
        priority: 10,
        dataRepair: true,
      });
      if (!a) throw Error("LEASE_ACQUIRE_FAILED");
      const same = await leases.acquire({
        userId,
        sourceJobType: "ACTIVITY_RECOMPUTE",
        sourceJobId: batch + "other",
        priority: 100,
        dataRepair: false,
      });
      if (same) throw Error("LEASE_SAME_USER_NOT_EXCLUSIVE");
      await leases.release(a);
      report.checks.push({ ok: true, name: "same-user-exclusive", count });
      caseIndex++;
    }
    report.completedAt = new Date().toISOString();
    report.ok = report.checks.every((c) => c.ok);
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  } finally {
    await app.close();
    await db.$disconnect();
  }
})().catch((e) => {
  report.ok = false;
  report.error = e.stack;
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.error(e.stack);
  process.exitCode = 1;
});
