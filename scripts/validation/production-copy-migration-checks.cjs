/* Only called by the local-only integration runner; never a production repair entry. */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
module.exports = async function checkProductionCopy({
  db,
  app,
  core,
  option,
  service,
  sensor,
  output,
}) {
  const url = new URL(process.env.DATABASE_URL);
  if (!url.pathname.startsWith("/starshards_replay_validation_production_"))
    throw Error("RESTORED_PRODUCTION_COPY_REQUIRED");
  const report = {
    schemaVersion: 1,
    mode: "actual-production-copy-per-user",
    startedAt: new Date().toISOString(),
    users: [],
    checkpoints: [],
    localOnly: true,
  };
  const save = () =>
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  let parquetReads = 0;
  const query = sensor.executeQuery.bind(sensor);
  sensor.executeQuery = async (sql, ...args) => {
    if (/read_parquet/i.test(sql)) parquetReads++;
    return query(sql, ...args);
  };
  try {
    const evidencePath = option("backup-evidence");
    if (!evidencePath) throw Error("LOCAL_BACKUP_EVIDENCE_REQUIRED");
    const evidence = await core(
      "importing/activity-data-migration-backup",
    ).readVerifiedMigrationBackup(evidencePath);
    assert.equal(evidence.purpose, "local-validation");
    assert.equal(evidence.databaseIdentity, await service.databaseIdentity());
    const activities = await db.activity.findMany({
      where: { state: 1 },
      select: {
        id: true,
        userId: true,
        startTime: true,
        activitySources: {
          where: { isActive: true, isPrimary: true },
          select: {
            sourceObject: { select: { rawStorageKey: true, fileKey: true } },
            canonicalSnapshotId: true,
            provider: true,
          },
        },
      },
    });
    const groups = new Map();
    for (const a of activities) {
      if (!groups.has(a.userId)) groups.set(a.userId, []);
      groups.get(a.userId).push(a);
    }
    const selected = [...groups]
      .filter(([, rows]) =>
        rows.every(
          (a) =>
            a.startTime &&
            a.activitySources.length === 1 &&
            a.activitySources[0].provider === "strava" &&
            a.activitySources[0].canonicalSnapshotId &&
            !a.activitySources[0].sourceObject?.rawStorageKey &&
            !a.activitySources[0].sourceObject?.fileKey,
        ),
      )
      .sort((a, b) => a[1].length - b[1].length);
    if (!selected.length) throw Error("COMPLETE_API_SOURCE_USERS_REQUIRED");
    const users = selected.map(([userId]) => userId);
    async function protectedState() {
      return digest(
        await Promise.all([
          db.activity.findMany({
            orderBy: { id: "asc" },
            select: {
              id: true,
              userId: true,
              hashId: true,
              activityName: true,
              description: true,
              sessionRpe: true,
              state: true,
            },
          }),
          db.userFitnessMetric.findMany({
            where: { source: "MANUAL" },
            orderBy: { id: "asc" },
          }),
          db.userZoneSetting.findMany({ orderBy: { id: "asc" } }),
          db.userBodyMetric.findMany({ orderBy: { id: "asc" } }),
          db.planWorkoutActivityLink.findMany({ orderBy: { id: "asc" } }),
          db.activitySource.findMany({ orderBy: { id: "asc" } }),
        ]),
      );
    }
    const protectedBefore = await protectedState();
    const otherActivitiesBefore = digest(
      await db.activity.findMany({
        where: { userId: { notIn: users } },
        orderBy: { id: "asc" },
      }),
    );
    const deferred = JSON.parse(
      fs.readFileSync(option("deferred-inventory")),
    ).rows;
    const deferredIds = deferred.map((row) => row.activityId);
    assert.equal(deferredIds.length, 144);
    const deferredBefore = digest(
      await db.activity.findMany({
        where: { id: { in: deferredIds } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          sportType: true,
          sportDefinitionCode: true,
          subSport: true,
        },
      }),
    );
    const activityService = app.get(
      core("api/activity/activity.service").ActivityService,
    );
    const worker = app.get(
      core("workers/workers/activity-recompute.worker")
        .ActivityRecomputeWorkerService,
    );
    const runKey = "production-copy-" + Date.now();
    report.runKey = runKey;
    // The DB backup contains API canonical records but no object-store bodies.
    // Build local Parquet through the regular canonical/LIGHT bridge, never fabricate sensor points.
    const preparedAt = Date.now();
    for (const [userId, rows] of selected) {
      const started = Date.now();
      let points = 0;
      for (const row of rows) {
        const source = await db.activitySource.findFirstOrThrow({
          where: {
            activityId: row.id,
            userId,
            isActive: true,
            isPrimary: true,
          },
          include: { activity: true, canonicalSnapshot: true },
        });
        const payload = source.canonicalSnapshot.payload;
        if (!Array.isArray(payload.records) || payload.records.length === 0)
          throw Error("CANONICAL_SENSOR_RECORDS_REQUIRED");
        points += payload.records.length;
        await activityService.generateParquetFileByCanonicalPayload(
          source.activity,
          payload,
          userId,
        );
        assert.ok(
          await db.activityParquetFile.findFirst({
            where: {
              activityId: row.id,
              type: "record",
              pointCount: { gt: 0 },
            },
          }),
        );
      }
      report.users.push({
        userId,
        activities: rows.length,
        canonicalPoints: points,
        localParquetPreparationMs: Date.now() - started,
      });
      save();
      console.log(
        JSON.stringify({
          phase: "canonical-local-input-ready",
          activities: rows.length,
          points,
        }),
      );
    }
    report.inputPreparationMs = Date.now() - preparedAt;
    // No title/RPE/manual metric/profile/zone/source/plan-link changes during local materialization.
    assert.equal(await protectedState(), protectedBefore);
    await service.prepare(runKey, evidence.targetRevision, users, evidence);
    const replayAt = Date.now(),
      deadline = Date.now() + 15 * 60000;
    let priorVerified = 0;
    while (Date.now() < deadline) {
      const rows = await service.status(runKey);
      if (rows.every((row) => row.status === "VERIFIED")) break;
      const current = rows.find((row) => row.status !== "VERIFIED");
      const index = rows.indexOf(current);
      assert.ok(
        rows.slice(index + 1).every((row) => row.status === "PENDING"),
        "A not verified before B starts",
      );
      if (
        rows.filter((row) => row.status === "VERIFIED").length !== priorVerified
      ) {
        priorVerified = rows.filter((row) => row.status === "VERIFIED").length;
        console.log(
          JSON.stringify({ phase: "user-verified", users: priorVerified }),
        );
      }
      await service.advance(runKey);
      const next = (await service.status(runKey)).find((row) =>
        ["MIGRATING", "VERIFYING"].includes(row.status),
      );
      if (next?.recomputeJobId) {
        const job = await db.activityRecomputeJob.findUniqueOrThrow({
          where: { id: next.recomputeJobId },
        });
        if (
          ["SCHEDULED", "FAILED"].includes(job.status) &&
          job.availableAt <= new Date()
        ) {
          const token = randomUUID();
          const claim = await db.activityRecomputeJob.updateMany({
            where: {
              id: job.id,
              status: job.status,
              availableAt: { lte: new Date() },
            },
            data: {
              status: "RUNNING",
              lockToken: token,
              leaseExpiresAt: new Date(Date.now() + 300000),
            },
          });
          assert.equal(claim.count, 1);
          const readBefore = parquetReads,
            started = Date.now();
          await worker.processJob({
            ...job,
            lockToken: token,
            includeActivityIds: job.triggerPayload.includeActivityIds,
          });
          const after = await db.activityRecomputeJob.findUniqueOrThrow({
            where: { id: job.id },
          });
          report.checkpoints.push({
            userId: next.userId,
            phase: next.phase,
            status: after.status,
            attempts: after.attempts,
            durationMs: Date.now() - started,
            parquetReads: parquetReads - readBefore,
            checkpoint: after.replayCheckpoint,
            errorCode: after.lastErrorCode,
          });
          save();
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    report.replayAndVerificationMs = Date.now() - replayAt;
    const rows = await service.status(runKey);
    assert.ok(
      rows.every((row) => row.status === "VERIFIED"),
      JSON.stringify(
        rows.map((row) => ({ status: row.status, errorCode: row.errorCode })),
      ),
    );
    assert.equal(await protectedState(), protectedBefore);
    assert.equal(
      digest(
        await db.activity.findMany({
          where: { userId: { notIn: users } },
          orderBy: { id: "asc" },
        }),
      ),
      otherActivitiesBefore,
    );
    assert.equal(
      digest(
        await db.activity.findMany({
          where: { id: { in: deferredIds } },
          orderBy: { id: "asc" },
          select: {
            id: true,
            sportType: true,
            sportDefinitionCode: true,
            subSport: true,
          },
        }),
      ),
      deferredBefore,
    );
    report.verification = rows;
    report.deferredClassificationsUnchanged = 144;
    report.otherActivitiesUnchanged = true;
    report.protectedDataUnchanged = true;
    report.readyActivities = await db.activity.count({
      where: { userId: { in: users }, state: 1, processingStatus: "READY" },
    });
    assert.equal(
      report.readyActivities,
      selected.reduce((n, [, rows]) => n + rows.length, 0),
    );
    report.ok = true;
    report.parquetReads = parquetReads;
    report.finishedAt = new Date().toISOString();
    save();
    console.log(
      JSON.stringify({
        ok: true,
        users: users.length,
        activities: report.readyActivities,
        inputPreparationMs: report.inputPreparationMs,
        replayAndVerificationMs: report.replayAndVerificationMs,
        deferredPreserved: 144,
      }),
    );
  } catch (error) {
    report.ok = false;
    report.error = error.stack;
    save();
    throw error;
  } finally {
    sensor.executeQuery = query;
  }
};
