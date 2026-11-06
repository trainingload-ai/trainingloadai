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
const hotVerification = option("verify-existing") === "true";
const result = {
  schemaVersion: 1,
  mode: hotVerification ? "hot-verification" : "cold-concurrent",
};
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
    const groups = await db.activity.groupBy({
      by: ["userId"],
      where: {
        user: {
          name: "Replay benchmark",
          email: { endsWith: "@local-validation.invalid" },
        },
      },
      _count: { id: true },
    });
    const selected = [308, 391].map(
      (n) => groups.find((g) => g._count.id === n)?.userId,
    );
    if (selected.some((u) => !u)) throw Error("BENCHMARK_FIXTURES_REQUIRED");
    if (
      await db.activityAnalysisLease.findFirst({
        where: { userId: { in: selected }, leaseExpiresAt: { gt: new Date() } },
      })
    )
      throw Error("BENCHMARK_FIXTURE_BUSY");
    for (const userId of hotVerification ? [] : selected) {
      await db.activityFitnessMetricsSnapshot.deleteMany({ where: { userId } });
      await db.userFitnessMetric.deleteMany({
        where: { userId, source: { in: ["AUTO", "ESTIMATED"] } },
      });
    }
    const worker = app.get(
      core("workers/workers/activity-recompute.worker")
        .ActivityRecomputeWorkerService,
    );
    const pageStats = new Map(),
      replayPage = replay.replay.bind(replay);
    replay.replay = async (request) => {
      const stats = pageStats.get(request.sourceJobId) ?? {
        completedPages: 0,
        reads: 0,
        failedPages: 0,
        hits: 0,
        processed: 0,
      };
      pageStats.set(request.sourceJobId, stats);
      try {
        const page = await replayPage(request);
        stats.completedPages++;
        stats.reads += page.highFrequencyReads;
        stats.hits += page.fingerprintHits;
        stats.processed += page.processedActivities;
        return page;
      } catch (error) {
        stats.failedPages++;
        throw error;
      }
    };
    const start = performance.now(),
      cpu = process.cpuUsage(),
      latency = [];
    let peakRss = process.memoryUsage().rss,
      busy = false;
    const timer = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      if (busy) return;
      busy = true;
      const t = performance.now();
      fetch(`http://127.0.0.1:${address.port}/api/health/ready`)
        .then((r) => {
          if (r.status !== 200) throw Error("READINESS_FAILED");
          latency.push(performance.now() - t);
        })
        .catch((e) => (result.apiError = e.message))
        .finally(() => (busy = false));
    }, 100);
    try {
      const outcomes = await Promise.allSettled(
        selected.map(async (userId, index) => {
          const activities = await db.activity.findMany({
            where: { userId, state: 1 },
            orderBy: [{ startTime: "asc" }, { id: "asc" }],
            select: { id: true, startTime: true },
          });
          const snapshotValues = () =>
            db.activityFitnessMetricsSnapshot.findMany({
              where: { userId },
              orderBy: { activityId: "asc" },
              select: {
                activityId: true,
                calculationFingerprint: true,
                actualLoad: true,
                actualLoadSource: true,
                pmcLocalDate: true,
                resolvedVo2maxValue: true,
              },
            });
          const resultValues = async () =>
            JSON.stringify(
              await Promise.all([
                snapshotValues(),
                db.pMCData.findMany({
                  where: { userId },
                  orderBy: { date: "asc" },
                  select: {
                    date: true,
                    dailyValue: true,
                    CTL: true,
                    ATL: true,
                    TSB: true,
                    activityCount: true,
                  },
                }),
                db.userFitnessMetric.findMany({
                  where: { userId, source: { in: ["AUTO", "ESTIMATED"] } },
                  orderBy: [
                    { type: "asc" },
                    { sport: "asc" },
                    { recordedAt: "asc" },
                  ],
                  select: {
                    type: true,
                    sport: true,
                    source: true,
                    value: true,
                    value2: true,
                    recordedAt: true,
                    projectionFingerprint: true,
                  },
                }),
              ]),
            );
          const before = hotVerification ? await resultValues() : null;
          const job = await db.activityRecomputeJob.create({
            data: {
              dedupeKey: "concurrent-bench:" + randomUUID(),
              userId,
              metricType: index === 0 ? "ACTIVITY_INPUT" : "DATA_REPAIR",
              reason: "LOCAL_CONCURRENT_BENCHMARK",
              affectedPipelines: ["FULL"],
              recomputeFrom: activities[0].startTime,
              recomputeTo: new Date(),
              lookbackDays: 0,
              availableAt: new Date(),
              status: "SCHEDULED",
              priority: index === 0 ? 100 : 10,
              triggerPayload: {
                includeActivityIds: activities.map((a) => a.id),
              },
            },
          });
          let schedulerWaitMs = 0;
          for (let polls = 0; polls < 30; polls++) {
            const current = await db.activityRecomputeJob.findUniqueOrThrow({
              where: { id: job.id },
            });
            if (current.status === "DEAD")
              throw Error("CONCURRENT_JOB_DEAD:" + current.lastErrorCode);
            if (current.status === "COMPLETED") {
              const snapshots =
                await db.activityFitnessMetricsSnapshot.findMany({
                  where: { userId },
                  select: {
                    activityId: true,
                    resolutionVersion: true,
                    calculationFingerprint: true,
                  },
                });
              if (
                snapshots.length !== activities.length ||
                snapshots.some(
                  (a) => a.resolutionVersion < 5 || !a.calculationFingerprint,
                )
              )
                throw Error("CONCURRENT_ACTIVITY_LOST");
              const stats = pageStats.get(job.id);
              if (
                hotVerification &&
                (stats.reads !== 0 ||
                  stats.hits !== stats.processed ||
                  before !== (await resultValues()))
              )
                throw Error("HOT_REPLAY_CHANGED_RESULT_OR_READ_RECORDS");
              return {
                count: snapshots.length,
                kind: index === 0 ? "NORMAL" : "DATA_REPAIR",
                attempts: current.attempts,
                schedulerWaitMs,
                ...stats,
              };
            }
            if (!["SCHEDULED", "FAILED"].includes(current.status))
              throw Error("UNEXPECTED_JOB_STATUS:" + current.status);
            // Preserve production scheduler backoff after a failed page. Otherwise
            // a tight test loop can exhaust attempts while the competing commit
            // is still active, which is not the actual worker scheduling policy.
            const scheduledWait = Math.max(
              0,
              current.availableAt.getTime() - Date.now(),
            );
            schedulerWaitMs += scheduledWait;
            const deadline = performance.now() + scheduledWait;
            while (performance.now() < deadline) {
              await new Promise((resolve) =>
                setTimeout(
                  resolve,
                  Math.min(10000, deadline - performance.now()),
                ),
              );
            }
            const token = randomUUID();
            const claimed = await db.activityRecomputeJob.updateMany({
              where: { id: job.id, status: current.status },
              data: {
                status: "RUNNING",
                lockToken: token,
                leaseExpiresAt: new Date(Date.now() + 300000),
              },
            });
            if (claimed.count !== 1) throw Error("TEST_CLAIM_LOST");
            await worker.processJob({
              ...current,
              lockToken: token,
              includeActivityIds: activities.map((a) => a.id),
            });
          }
          throw Error("CONCURRENT_JOB_DID_NOT_COMPLETE");
        }),
      );
      for (const outcome of outcomes)
        if (outcome.status === "rejected") throw outcome.reason;
      result.jobs = outcomes.map((o) => o.value);
    } finally {
      clearInterval(timer);
      while (busy) await new Promise((r) => setTimeout(r, 10));
    }
    const sorted = latency.toSorted((a, b) => a - b),
      c = process.cpuUsage(cpu);
    Object.assign(result, {
      ok: !result.apiError,
      schedulingBackoffAccelerated: false,
      durationMs: performance.now() - start,
      cpuSeconds: (c.user + c.system) / 1e6,
      peakRssMiB: peakRss / 1048576,
      sqlQueries: sqlCount,
      parquetQueries,
      apiSamples: latency.length,
      apiP50Ms: sorted[Math.floor(sorted.length * 0.5)],
      apiP95Ms:
        sorted[
          Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
        ],
    });
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
