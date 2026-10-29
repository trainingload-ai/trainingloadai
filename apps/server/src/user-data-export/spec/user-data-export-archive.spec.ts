import { describe, expect, it } from '@jest/globals';
import { DuckDBInstance } from '@duckdb/node-api';
import Ajv2020 from 'ajv/dist/2020';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { USER_DATA_EXPORT_SCHEMAS } from '@shared/user-data-export';

import { UserDataExportArchiveService } from '../user-data-export-archive.service';
import { CompetitionQueryService } from '../../api/competition/application/competition-query.service';
import { HealthFileQueryService } from '../../health-data/health-file-query.service';
import { ImportingJobService } from '../../importing/importing-job.service';
import { SensorFileQueryService } from '../../sensor/sensor-file-query.service';
import { UserQueryService } from '../../api/user/user-query.service';
import { UserIdentityRepository } from '../../api/user/persistence/user-identity.repository';
import { CompetitionRepository } from '../../api/competition/persistence/competition.repository';
import { HealthDataRepository } from '../../health-data/persistence/health-data.repository';
import { ImportingJobRepository } from '../../importing/persistence/importing-job.repository';
import { SensorFileRepository } from '../../sensor/persistence/sensor-file.repository';

type ArchiveInternals = {
  exportHealthSeries(
    job: { id: string; userId: string; dataCutoffAt: Date },
    root: string,
    catalog: Array<Record<string, unknown>>,
    warnings: string[],
  ): Promise<unknown>;
  activityRecordSelect(args: {
    columns: Set<string>;
    activityId: string;
    privacy: string;
    totalDistance: number | null;
  }): string;
};

function emptyModel() {
  return { findMany: async () => [] };
}

function archiveDependencies(prisma: object) {
  return [
    new CompetitionQueryService(new CompetitionRepository(prisma as never)),
    new HealthFileQueryService(new HealthDataRepository(prisma as never)),
    new ImportingJobService(new ImportingJobRepository(prisma as never)),
    new SensorFileQueryService(new SensorFileRepository(prisma as never)),
    new UserQueryService(new UserIdentityRepository(prisma as never)),
  ] as const;
}

const RFC3339_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function schemaValidator(schema: Record<string, unknown>) {
  return new Ajv2020({
    strict: false,
    formats: {
      date: (value: string) => ISO_DATE.test(value),
      'date-time': (value: string) =>
        RFC3339_DATE_TIME.test(value) && Number.isFinite(Date.parse(value)),
    },
  }).compile(schema);
}

async function readJsonl(filePath: string) {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function zipEntryNames(filePath: string): Promise<string[]> {
  const yauzl = require('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(
      filePath,
      { lazyEntries: true },
      (
        error: Error | null,
        archive: {
          on(
            event: 'entry' | 'end' | 'error',
            listener: (arg?: { fileName: string } | Error) => void,
          ): void;
          readEntry(): void;
        },
      ) => {
        if (error) return reject(error);
        const entries: string[] = [];
        archive.on('entry', (entry) => {
          entries.push((entry as { fileName: string }).fileName);
          archive.readEntry();
        });
        archive.on('end', () => resolve(entries));
        archive.on('error', (archiveError) =>
          reject(archiveError instanceof Error ? archiveError : error),
        );
        archive.readEntry();
      },
    );
  });
}

describe('UserDataExportArchiveService', () => {
  it('creates an AI-readable ZIP without identity fields or columnar files', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    const activity = {
      id: 42,
      hashId: 'public-activity-id',
      activityName: 'Easy run',
      sportType: 'RUN',
      startTime: null,
      timestamp: null,
      timezone: null,
      createdAt: now,
      updatedAt: now,
      state: 1,
      mergedIntoActivity: null,
      thirdPartyProvider: 'GARMIN',
      thirdPartyActivityId: 'external-identity',
      syncedAt: now,
      distance: 5_000,
      coggan: {
        isopower: 245,
        bikeStress: 52,
        intensityFactor: 0.82,
      },
    };
    let competitionQuery: unknown = null;
    const prisma = {
      t_user: {
        findUniqueOrThrow: async () => ({
          id: 'internal-user-id',
          name: 'Private Name',
          email: 'private@example.com',
          preferredLocale: 'zh',
          createdAt: now,
          updatedAt: now,
          userProfile: {
            loadSources: 'POWER',
            preferredSports: 'RUN',
            altitudeOptimizationModel: 'THRESHOLDMETHOD',
            altitudeThreshold: 1_500,
            defaultVdotSource: 'HEARTRATE',
            vo2maxCorrectionFactor: 1,
            heartRateZoneModel: 'FRIEL',
            paceZoneModel: 'DANIELS',
            powerZoneModel: 'FRIEL',
          },
        }),
      },
      userSetting: emptyModel(),
      userAutoUpdateConfig: {
        findMany: async () => [
          {
            metric: 'FTP',
            enabled: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      userBodyMetric: {
        findFirst: async () => ({ value: 'Asia/Shanghai' }),
        findMany: async () => [],
      },
      userFitnessMetric: {
        findMany: async () => [
          {
            id: 'fitness-metric-id',
            type: 'CP',
            value: 300,
            value2: 18_000,
            sport: 'CYCLING',
            recordedAt: now,
            source: 'MANUAL',
            changeSource: 'MANUAL',
            originProvider: null,
            originExternalId: null,
            originSyncedAt: null,
          },
        ],
      },
      userZoneSetting: emptyModel(),
      userZoneSettingVersion: {
        findMany: async () => [
          {
            sportType: 'RUN',
            zoneType: 'HEART_RATE',
            benchmark: 'LTHR',
            zones: [{ order: 1, min: 120, max: 140, name: 'Easy' }],
            changeSource: 'MANUAL',
            originExternalId: null,
            createdAt: now,
          },
        ],
      },
      athleteMemoryFact: {
        findMany: async () => [
          {
            id: 'memory-fact-id',
            kind: 'OBSERVATION',
            category: 'sleep_quality',
            claim: 'Reported poor sleep the previous night.',
            status: 'ACTIVE',
            epistemicStatus: 'USER_ASSERTED',
            confidence: 0.94,
            eventStart: new Date('2026-08-10T15:00:00.000Z'),
            eventEnd: new Date('2026-08-10T23:00:00.000Z'),
            timeText: 'last night',
            timezone: 'Asia/Shanghai',
            validFrom: new Date('2026-08-10T15:00:00.000Z'),
            validUntil: new Date('2026-08-13T15:00:00.000Z'),
            decayProfile: 'ACUTE_RECOVERY',
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      activity: { findMany: async () => [activity] },
      activityLap: emptyModel(),
      activityZone: emptyModel(),
      activityCoggan: {
        findMany: async () => [
          {
            id: 'coggan-id',
            activityId: 42,
            sport: 'RUN',
            isopower: 245,
            calculatedAt: now,
          },
        ],
      },
      activityBikeScore: emptyModel(),
      activitySwimScore: emptyModel(),
      activityGOVSS: emptyModel(),
      activityCalculatedPower: emptyModel(),
      activityTrimp: emptyModel(),
      activityVO2Max: emptyModel(),
      activityTrainingEffect: emptyModel(),
      activityPeakMetric: emptyModel(),
      activityPerformanceTT: emptyModel(),
      activityStrengthExercise: emptyModel(),
      userDailyHealthMetric: {
        findMany: async () => [
          {
            id: 'daily-health-id',
            date: now,
            timezone: 'Asia/Shanghai',
            metricType: 'RESTING_HEART_RATE',
            value: 48,
            unit: 'bpm',
            selectedProvider: 'GARMIN',
            sourceBreakdown: {
              GARMIN: {
                value: 48,
                unit: 'bpm',
                externalId: 'external-health-id',
                sourceName: "Victor's Watch",
              },
            },
            computedAt: now,
            updatedAt: now,
          },
        ],
      },
      canonicalHealthSession: {
        findMany: async () => [
          {
            id: 'health-session-id',
            sessionType: 'SLEEP',
            startTime: new Date('2026-08-10T15:00:00.000Z'),
            endTime: new Date('2026-08-10T23:00:00.000Z'),
            calendarDate: now,
            timezone: 'Asia/Shanghai',
            durationSeconds: 28_800,
            score: 82,
            summary: { deepSleepSeconds: 3_600 },
            selectedProvider: 'GARMIN',
            sourceBreakdown: {
              'internal-source-id': {
                provider: 'GARMIN',
                connectionId: 'internal-connection-id',
                externalId: 'external-session-id',
                selected: true,
              },
            },
            computedAt: now,
            updatedAt: now,
          },
        ],
      },
      plan: {
        findMany: async () => [
          {
            id: 'plan-id',
            title: 'Marathon plan',
            description: 'Saved plan description',
            goal: 'Finish under four hours',
            sourceType: 'AI',
            generationMetadata: {
              prompt: 'internal generation prompt must not be exported',
            },
            periodWeeks: 12,
            startDate: now,
            endDate: new Date('2026-11-03T00:00:00.000Z'),
            status: 'ACTIVE',
            activatedAt: now,
            pausedAt: null,
            completedAt: null,
            cancelledAt: null,
            currentWeekIndex: 0,
            currentDayIndex: 0,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      planWorkout: {
        findMany: async () => [
          {
            id: 'workout-id',
            planId: 'plan-id',
            name: 'Easy run',
            text: 'Run easily for 45 minutes',
            notes: 'Keep the effort conversational',
            sportType: 'RUN',
            sportDefinitionCode: 'run.road',
            structureKind: 'ENDURANCE',
            dslVersion: 1,
            scheduledDate: now,
            status: 'PLANNED',
            plannedDurationSeconds: 2_700,
            dayOffset: 0,
            sessionIndex: 1,
            plannedSessionRpe: 3,
            estimatedLoad: 35,
            estimatedLoadSource: 'HEART_RATE',
            estimatedLoadInputs: { threshold: 170 },
            estimatedLoadComputedAt: now,
            completedAt: null,
            skippedAt: null,
            createdAt: now,
            updatedAt: now,
            steps: [],
            strengthExercises: [],
          },
        ],
      },
      competitionEvent: {
        findMany: async (query: unknown) => {
          competitionQuery = query;
          return [
            {
              id: 'competition-id',
              title: 'Shanghai Marathon',
              sportType: 'RUN',
              startDate: new Date('2026-11-29T00:00:00.000Z'),
              endDate: null,
              startTimeMinute: 420,
              timezone: 'Asia/Shanghai',
              distanceMeters: 42_195,
              importance: 'A',
              goalType: 'TIME',
              targetTimeSeconds: 14_400,
              notes: null,
              status: 'PLANNED',
              source: 'MANUAL',
              location: 'Shanghai',
              createdAt: now,
              updatedAt: now,
            },
          ];
        },
      },
      pMCData: emptyModel(),
      activityParquetFile: emptyModel(),
      healthSeriesFile: emptyModel(),
    };
    const service = new UserDataExportArchiveService(
      prisma as never,
      {} as never,
      {} as never,
      {
        findExportPlansCutoff: async () => prisma.plan.findMany(),
        findExportWorkoutsCutoff: async () => prisma.planWorkout.findMany(),
      } as never,
      { listExportRows: async () => [] } as never,
      ...archiveDependencies(prisma),
    );
    const progress: string[] = [];
    const result = await service.build(
      {
        id: 'export-fixture-id',
        userId: 'internal-user-id',
        mode: 'AI_ANALYSIS',
        locationPrivacy: 'REMOVE_GPS',
        includeOriginalFiles: false,
        dataCutoffAt: now,
        requestedAt: now,
      } as never,
      async (stage) => {
        progress.push(stage);
      },
    );

    try {
      const archiveRoot = path.join(result.workingDirectory, 'archive');
      const profile = JSON.parse(
        await fs.readFile(
          path.join(archiveRoot, '02_PROFILE/account.json'),
          'utf8',
        ),
      );
      const manifest = JSON.parse(
        await fs.readFile(path.join(archiveRoot, 'manifest.json'), 'utf8'),
      );
      const catalog = JSON.parse(
        await fs.readFile(
          path.join(archiveRoot, '00_READ_ME_FIRST/dataset-catalog.json'),
          'utf8',
        ),
      );
      const overview = JSON.parse(
        await fs.readFile(
          path.join(archiveRoot, '00_READ_ME_FIRST/user-data-overview.json'),
          'utf8',
        ),
      );
      const exportedActivity = JSON.parse(
        (
          await fs.readFile(
            path.join(archiveRoot, '03_ACTIVITIES/activities.jsonl'),
            'utf8',
          )
        ).trim(),
      );
      const [exportedPlan] = await readJsonl(
        path.join(archiveRoot, '05_TRAINING/plans.jsonl'),
      );
      const [exportedWorkout] = await readJsonl(
        path.join(archiveRoot, '05_TRAINING/planned-workouts.jsonl'),
      );
      const [exportedCompetition] = await readJsonl(
        path.join(archiveRoot, '05_TRAINING/competitions.jsonl'),
      );
      const [exportedDailyHealth] = await readJsonl(
        path.join(archiveRoot, '04_HEALTH/daily-metrics.jsonl'),
      );
      const [exportedHealthSession] = await readJsonl(
        path.join(archiveRoot, '04_HEALTH/sessions.jsonl'),
      );
      const [exportedMetric] = await readJsonl(
        path.join(archiveRoot, '03_ACTIVITIES/metrics.jsonl'),
      );
      const [exportedFitnessMetric] = await readJsonl(
        path.join(archiveRoot, '02_PROFILE/fitness-metrics.jsonl'),
      );
      const archiveStat = await fs.stat(result.archivePath);
      const zipEntries = await zipEntryNames(result.archivePath);

      expect(profile.displayName).toBeNull();
      expect(profile.email).toBeNull();
      expect(profile.userId).not.toBe('internal-user-id');
      expect(profile.timezone).toBe('Asia/Shanghai');
      expect(profile.heartRateZoneModel).toBe('FRIEL');
      expect(overview.userId).toBe(profile.userId);
      expect(
        schemaValidator(USER_DATA_EXPORT_SCHEMAS['user-profile'])(profile),
      ).toBe(true);
      for (const dataset of catalog.datasets as Array<{
        path: string;
        schemaPath: string;
        mediaType: string;
      }>) {
        if (dataset.mediaType !== 'application/x-ndjson') continue;
        const schemaId = path
          .basename(dataset.schemaPath)
          .replace(/\.schema\.json$/, '');
        const schema = (
          USER_DATA_EXPORT_SCHEMAS as Record<string, Record<string, unknown>>
        )[schemaId];
        expect(schema).toBeDefined();
        const validate = schemaValidator(schema!);
        const rows = await readJsonl(path.join(archiveRoot, dataset.path));
        for (const row of rows) {
          expect(validate(row)).toBe(true);
        }
      }
      expect(exportedActivity.startTime).toBeNull();
      expect(exportedActivity.sourceExternalId).toBeNull();
      const validateActivity = schemaValidator(
        USER_DATA_EXPORT_SCHEMAS.activity,
      );
      expect(validateActivity(exportedActivity)).toBe(true);
      expect(
        schemaValidator(USER_DATA_EXPORT_SCHEMAS['training-plan'])(
          exportedPlan,
        ),
      ).toBe(true);
      expect(exportedPlan).toMatchObject({
        goal: 'Finish under four hours',
        sourceType: 'AI',
        periodWeeks: 12,
      });
      expect(exportedPlan).not.toHaveProperty('generationMetadata');
      expect(
        schemaValidator(USER_DATA_EXPORT_SCHEMAS['planned-workout'])(
          exportedWorkout,
        ),
      ).toBe(true);
      expect(exportedWorkout).toMatchObject({
        notes: 'Keep the effort conversational',
        structureKind: 'ENDURANCE',
        dslVersion: 1,
      });
      expect(
        schemaValidator(USER_DATA_EXPORT_SCHEMAS.competition)(
          exportedCompetition,
        ),
      ).toBe(true);
      expect(exportedCompetition).toMatchObject({
        startDate: '2026-11-29',
        startTimeMinute: 420,
        timezone: 'Asia/Shanghai',
      });
      expect(exportedCompetition).not.toHaveProperty('startTime');
      expect(competitionQuery).toMatchObject({ where: { deletedAt: null } });
      expect(
        schemaValidator(USER_DATA_EXPORT_SCHEMAS['health-daily-metric'])(
          exportedDailyHealth,
        ),
      ).toBe(true);
      expect(exportedDailyHealth.sourceBreakdown.GARMIN.externalId).toBeNull();
      expect(exportedDailyHealth.sourceBreakdown.GARMIN.sourceName).toBeNull();
      expect(
        schemaValidator(USER_DATA_EXPORT_SCHEMAS['health-session'])(
          exportedHealthSession,
        ),
      ).toBe(true);
      expect(exportedHealthSession.sourceBreakdown.candidates[0]).toMatchObject(
        {
          provider: 'GARMIN',
          externalId: null,
        },
      );
      expect(
        exportedHealthSession.sourceBreakdown.candidates[0],
      ).not.toHaveProperty('connectionId');
      expect(
        schemaValidator(USER_DATA_EXPORT_SCHEMAS['activity-metric'])(
          exportedMetric,
        ),
      ).toBe(true);
      expect(exportedMetric).toMatchObject({
        metricType: 'COGGAN.isopower',
        unit: 'W',
        algorithm: 'TRAININGLOAD.COGGAN',
        algorithmVersion: 'legacy-unversioned',
      });
      expect(exportedFitnessMetric).toMatchObject({
        type: 'CP',
        value: 300,
        unit: 'W',
        secondaryValue: 18_000,
        secondaryUnit: 'J',
      });
      expect(manifest.identityRedacted).toBe(true);
      expect(manifest.includeOriginalFiles).toBe(false);
      expect(
        manifest.files.some((file: { path: string }) =>
          file.path.toLowerCase().endsWith('.parquet'),
        ),
      ).toBe(false);
      expect(
        catalog.datasets.every(
          (dataset: {
            schemaPath: string;
            coverage: unknown;
            redactions: unknown;
          }) =>
            dataset.schemaPath.startsWith('01_SCHEMAS/') &&
            dataset.coverage != null &&
            Array.isArray(dataset.redactions),
        ),
      ).toBe(true);
      expect(archiveStat.size).toBeGreaterThan(1_000);
      expect(zipEntries).toContain('manifest.json');
      expect(zipEntries).toContain('00_READ_ME_FIRST/README_FOR_AI.md');
      for (const file of manifest.files as Array<{
        path: string;
        sizeBytes: string;
        sha256: string;
      }>) {
        const content = await fs.readFile(path.join(archiveRoot, file.path));
        expect(content.length.toString()).toBe(file.sizeBytes);
        expect(createHash('sha256').update(content).digest('hex')).toBe(
          file.sha256,
        );
      }
      expect(progress.at(-1)).toBe('packaging');
    } finally {
      await service.cleanup(result);
    }
  });

  it('combines internal health partitions into monthly AI-readable CSV files', async () => {
    const workingDirectory = await fs.mkdtemp(
      path.join(tmpdir(), 'health-series-export-test-'),
    );
    const root = path.join(workingDirectory, 'archive');
    const sourceDirectory = path.join(workingDirectory, 'source');
    await fs.mkdir(sourceDirectory, { recursive: true });
    const sourcePaths = new Map<string, string>();
    const duckdb = await DuckDBInstance.create(':memory:');
    const connection = await duckdb.connect();
    try {
      for (let index = 0; index < 3; index += 1) {
        const filePath = path.join(sourceDirectory, `${index}.parquet`);
        await connection.run(`
          COPY (
            SELECT
              ${1_786_400_000_000 + index * 60_000}::BIGINT AS timestamp_utc_ms,
              NULL::BIGINT AS end_timestamp_utc_ms,
              ${60 + index}::DOUBLE AS value,
              'VALID'::VARCHAR AS status,
              0.9::DOUBLE AS quality,
              NULL::VARCHAR AS source_message,
              ${index}::INTEGER AS source_index,
              NULL::VARCHAR AS attributes_json
          ) TO '${filePath.replace(/'/g, "''")}' (FORMAT PARQUET)
        `);
        sourcePaths.set(`source-${index}`, filePath);
      }
    } finally {
      connection.disconnectSync?.();
      duckdb.closeSync();
    }

    const now = new Date('2026-08-11T12:00:00.000Z');
    const files = [0, 1, 2].map((index) => ({
      id: `series-${index}`,
      userId: 'user-id',
      snapshotId: 'snapshot-id',
      provider: 'GARMIN',
      sourceNamespace: 'garmin',
      metricCode: 'HEART_RATE',
      valueType: 'NUMBER',
      unit: 'bpm',
      localDate: new Date(
        `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      ),
      startTime: now,
      endTime: now,
      offsetSeconds: 0,
      timezone: 'Asia/Shanghai',
      part: 0,
      pointCount: 1,
      validPointCount: 1,
      minValue: 60 + index,
      maxValue: 60 + index,
      parquetPath: `source-${index}`,
      parquetSchemaVersion: 'v1',
      fileSize: null,
      checksum: `checksum-${index}`,
      storageStrategy: 'LOCAL',
      metadata: null,
      createdAt: now,
      updatedAt: now,
    }));
    const prisma = {
      healthSeriesFile: { findMany: async () => files },
    };
    const service = new UserDataExportArchiveService(
      prisma as never,
      {
        copyFileToPath: async (key: string, destination: string) => {
          await fs.copyFile(sourcePaths.get(key)!, destination);
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      ...archiveDependencies(prisma),
    );
    const catalog: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];

    try {
      await (service as unknown as ArchiveInternals).exportHealthSeries(
        {
          id: 'export-id',
          userId: 'user-id',
          dataCutoffAt: now,
        },
        root,
        catalog,
        warnings,
      );
      const outputDirectory = path.join(root, '04_HEALTH/series');
      const outputFiles = await fs.readdir(outputDirectory);
      const csv = await fs.readFile(
        path.join(outputDirectory, outputFiles[0]!),
        'utf8',
      );

      expect(outputFiles).toHaveLength(1);
      expect(csv.trim().split('\n')).toHaveLength(4);
      expect(csv).toContain('metricType,timestamp');
      expect(csv).toContain('HEART_RATE');
      for (const line of csv.trim().split('\n').slice(1)) {
        expect(line.split(',')[1]).toMatch(RFC3339_DATE_TIME);
        expect(line.split(',')[1]?.endsWith('Z')).toBe(true);
      }
      expect(warnings).toEqual([]);
      expect(catalog[0]).toMatchObject({
        id: 'health-series-points',
        recordCount: 3,
        primaryKey: ['metricType', 'timestamp', 'provider', 'sourceIndex'],
      });
    } finally {
      await fs.rm(workingDirectory, { recursive: true, force: true });
    }
  });

  it('formats activity record timestamps as explicit UTC RFC 3339 values', async () => {
    const prisma = {};
    const service = new UserDataExportArchiveService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ...archiveDependencies(prisma),
    );
    const select = (
      service as unknown as ArchiveInternals
    ).activityRecordSelect({
      columns: new Set(['timestamp']),
      activityId: 'activity-id',
      privacy: 'REMOVE_GPS',
      totalDistance: null,
    });
    const duckdb = await DuckDBInstance.create(':memory:');
    const connection = await duckdb.connect();
    try {
      const result = await connection.run(`${select}
        FROM (
          SELECT TIMESTAMP '2026-08-11 12:34:56.123456' AS timestamp
        ) source
      `);
      const rows = await result.getRows();
      expect(rows[0]?.[1]).toBe('2026-08-11T12:34:56.123456Z');
      expect(String(rows[0]?.[1])).toMatch(RFC3339_DATE_TIME);
    } finally {
      connection.disconnectSync?.();
      duckdb.closeSync();
    }
  });
});
