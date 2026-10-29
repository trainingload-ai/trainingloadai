import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DuckDBConnection } from '@duckdb/node-api';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { UserDataExportJob } from '@prisma/client';

import { ActivityService } from '@/api/activity/activity.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { CompetitionQueryService } from '@/api/competition/application/competition-query.service';
import { HealthFileQueryService } from '@/health-data/health-file-query.service';
import { ImportingJobService } from '@/importing/importing-job.service';
import { SensorFileQueryService } from '@/sensor/sensor-file-query.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { PMCService } from '@/training-load/pmc.service';
import { PrismaService } from '@/prisma/prisma.service';
import { isPublicUserSettingCategory } from '@/api/user/public-user-setting-policy';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { forEachWithConcurrency } from '@/utils/async-concurrency.util';
import { loadDuckDBModule } from '@/runtime/duckdb-runtime';
import {
  USER_DATA_EXPORT_ANALYSIS_GUIDE,
  USER_DATA_EXPORT_EXCLUSIONS,
  USER_DATA_EXPORT_FORMAT,
  USER_DATA_EXPORT_PRIVACY_GUIDE,
  USER_DATA_EXPORT_README_FOR_AI,
  USER_DATA_EXPORT_SCHEMAS,
  type UserDataExportSchemaId,
} from '@shared/user-data-export';

type Progress = (
  stage: string,
  current: number,
  total: number,
) => Promise<void>;

type CatalogEntry = {
  id: string;
  path: string;
  schemaPath: string;
  mediaType: string;
  recordCount: number;
  description: string;
  primaryKey: string[];
  relations: Array<{
    fields: string[];
    dataset: string;
    referencedFields: string[];
  }>;
  coverage: {
    timeStart: string | null;
    timeEnd: string | null;
    missingValueRate: number | null;
  };
  redactions: string[];
};

type FileIntegrity = {
  path: string;
  mediaType: string;
  sizeBytes: string;
  sha256: string;
};

type BuildResult = {
  archivePath: string;
  workingDirectory: string;
  fileName: string;
  warnings: string[];
};

const JSON_MEDIA_TYPE = 'application/json';
const JSONL_MEDIA_TYPE = 'application/x-ndjson';
const CSV_MEDIA_TYPE = 'text/csv';
const SERIES_DOWNLOAD_CONCURRENCY = 8;
const ORIGINAL_FILE_DOWNLOAD_CONCURRENCY = 8;

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function date(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function isoWeekStart(value: Date) {
  const day = value.getUTCDay() || 7;
  const monday = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}

function privacyReviewedProvenance(
  value: unknown,
  mode: UserDataExportJob['mode'],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => privacyReviewedProvenance(item, mode));
  }
  if (!value || typeof value !== 'object') return value;

  const entries = Object.entries(value as Record<string, unknown>);
  const isSessionCandidateMap =
    entries.length > 0 &&
    entries.every(
      ([, item]) =>
        item != null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        'provider' in item,
    );
  if (isSessionCandidateMap) {
    return {
      candidates: entries.map(([, item]) =>
        privacyReviewedProvenance(item, mode),
      ),
    };
  }

  return Object.fromEntries(
    entries
      .filter(([key]) => !/^connectionId$/i.test(key))
      .map(([key, item]) => {
        const isExternalIdentifier =
          /^(?:externalId|externalUuid|sourceExternalId|selectedExternalId|selectedExternalUuid|sourceBundleId|selectedSourceBundleId|sourceName|selectedSourceName|deviceName|selectedSources)$/i.test(
            key,
          );
        return [
          key,
          mode === 'AI_ANALYSIS' && isExternalIdentifier
            ? null
            : privacyReviewedProvenance(item, mode),
        ];
      }),
  );
}

const ACTIVITY_METRIC_UNITS: Record<string, string | null> = {
  'COGGAN.isopower': 'W',
  'COGGAN.variabilityIndex': null,
  'COGGAN.intensityFactor': null,
  'COGGAN.bikeStress': 'points',
  'COGGAN.tssPerHour': 'points/h',
  'COGGAN.efficiencyFactor': 'W/bpm',
  'BIKE_SCORE.xPower': 'W',
  'BIKE_SCORE.variabilityIndex': null,
  'BIKE_SCORE.relativeIntensity': null,
  'BIKE_SCORE.bikeScore': 'points',
  'BIKE_SCORE.responseIndex': null,
  'BIKE_SCORE.aerobicTISS': 'points',
  'BIKE_SCORE.anaerobicTISS': 'points',
  'BIKE_SCORE.tissAerobicity': null,
  'SWIM_SCORE.swimScore': 'points',
  'GOVSS.govss': 'points',
  'TRIMP.trimp': 'points',
  'TRIMP.trimpZonalPoints': 'points',
  'TRIMP.trimp100': 'points',
  'VO2_MAX.vo2maxVdotByRace': 'VDOT',
  'VO2_MAX.vo2maxVdotByHr': 'VDOT',
  'VO2_MAX.vo2maxVdotByFactor': 'VDOT',
  'VO2_MAX.vo2maxCorrectionFactor': null,
  'TRAINING_EFFECT.epoc': 'ml/kg',
  'TRAINING_EFFECT.trainingEffect': 'score',
  'TRAINING_EFFECT.recoveryHours': 'h',
  'TRAINING_EFFECT.aerobicEpoc': 'ml/kg',
  'TRAINING_EFFECT.anaerobicEpoc': 'ml/kg',
  'TRAINING_EFFECT.aerobicTrainingEffect': 'score',
  'TRAINING_EFFECT.anaerobicTrainingEffect': 'score',
};

const BODY_METRIC_UNITS: Record<string, string | null> = {
  WEIGHT: 'kg',
  HEIGHT: 'm',
  BIRTHDAY: null,
  GENDER: null,
  TIMEZONE: null,
};

const FITNESS_METRIC_UNITS: Record<
  string,
  { primary: string | null; secondary: string | null }
> = {
  CP: { primary: 'W', secondary: 'J' },
  W_PRIME: { primary: 'J', secondary: null },
  FTP: { primary: 'W', secondary: null },
  MAX_HR: { primary: 'bpm', secondary: null },
  RESTING_HR: { primary: 'bpm', secondary: null },
  LTHR: { primary: 'bpm', secondary: null },
  AET_HR: { primary: 'bpm', secondary: null },
  CS: { primary: 'm/s', secondary: 'm' },
  TP: { primary: 'm/s', secondary: 's/km' },
  AET_PACE: { primary: 's/km', secondary: null },
  VO2_MAX: { primary: 'ml/kg/min', secondary: null },
  P_MAX: { primary: 'W', secondary: null },
};

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function quotedIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function safePathPart(value: string, fallback: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 160);
  return normalized || fallback;
}

function mimeTypeFor(relativePath: string) {
  if (relativePath.endsWith('.json')) return JSON_MEDIA_TYPE;
  if (relativePath.endsWith('.jsonl')) return JSONL_MEDIA_TYPE;
  if (relativePath.endsWith('.csv')) return CSV_MEDIA_TYPE;
  if (relativePath.endsWith('.fit')) return 'application/vnd.ant.fit';
  if (relativePath.endsWith('.gpx')) return 'application/gpx+xml';
  if (relativePath.endsWith('.tcx')) return 'application/vnd.garmin.tcx+xml';
  if (relativePath.endsWith('.md')) return 'text/markdown';
  return 'application/octet-stream';
}

function csvCell(value: unknown) {
  if (value == null) return '';
  const text =
    typeof value === 'object' ? JSON.stringify(jsonSafe(value)) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const COVERAGE_TIME_KEYS = [
  'startTime',
  'timestamp',
  'date',
  'localDate',
  'effectiveDate',
  'scheduledDate',
  'createdAt',
] as const;

function datasetCoverage(rows: unknown[]): CatalogEntry['coverage'] {
  let timeStart: number | null = null;
  let timeEnd: number | null = null;
  let valueCount = 0;
  let missingValueCount = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    for (const value of Object.values(record)) {
      valueCount += 1;
      if (value == null) missingValueCount += 1;
    }
    const timeValue = COVERAGE_TIME_KEYS.map((key) => record[key]).find(
      (value) => typeof value === 'string' || value instanceof Date,
    );
    if (timeValue == null) continue;
    const timestamp = new Date(timeValue as string | Date).getTime();
    if (!Number.isFinite(timestamp)) continue;
    timeStart = timeStart == null ? timestamp : Math.min(timeStart, timestamp);
    timeEnd = timeEnd == null ? timestamp : Math.max(timeEnd, timestamp);
  }
  return {
    timeStart: timeStart == null ? null : new Date(timeStart).toISOString(),
    timeEnd: timeEnd == null ? null : new Date(timeEnd).toISOString(),
    missingValueRate: valueCount === 0 ? null : missingValueCount / valueCount,
  };
}

function timeRangeCoverage(
  values: Array<Date | null | undefined>,
): CatalogEntry['coverage'] {
  const timestamps = values
    .map((value) => value?.getTime())
    .filter((value): value is number => Number.isFinite(value));
  return {
    timeStart:
      timestamps.length === 0
        ? null
        : new Date(Math.min(...timestamps)).toISOString(),
    timeEnd:
      timestamps.length === 0
        ? null
        : new Date(Math.max(...timestamps)).toISOString(),
    missingValueRate: null,
  };
}

function shouldLogProgress(index: number, total: number) {
  const completed = index + 1;
  const interval = Math.max(1, Math.ceil(total / 10));
  return completed === 1 || completed === total || completed % interval === 0;
}

@Injectable()
export class UserDataExportArchiveService {
  private readonly logger = new Logger(UserDataExportArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly activitiesService: ActivityService,
    private readonly planQuery: PlanQueryService,
    private readonly pmc: PMCService,
    private readonly competitions: CompetitionQueryService,
    private readonly healthFiles: HealthFileQueryService,
    private readonly importJobs: ImportingJobService,
    private readonly sensorFiles: SensorFileQueryService,
    private readonly users: UserQueryService,
  ) {}

  async build(
    job: UserDataExportJob,
    progress: Progress,
  ): Promise<BuildResult> {
    const workingDirectory = await fs.mkdtemp(
      path.join(tmpdir(), 'trainingload-user-export-'),
    );
    const root = path.join(workingDirectory, 'archive');
    const archivePath = path.join(workingDirectory, `${job.id}.zip`);
    const warnings: string[] = [
      ...(job.mode === 'AI_ANALYSIS'
        ? ['Direct account identity fields were removed for AI analysis.']
        : []),
      ...(job.locationPrivacy === 'REMOVE_GPS'
        ? ['All activity GPS coordinates were removed.']
        : job.locationPrivacy === 'REDACT_FREQUENT_LOCATIONS'
          ? ['Activity coordinates near starts and ends were removed.']
          : []),
      ...(job.includeOriginalFiles
        ? [
            'Original source files can contain exact GPS coordinates and device metadata.',
          ]
        : []),
    ];
    const catalog: CatalogEntry[] = [];
    const totalStages = 16;
    let currentStage = 0;
    const runStage = async <T>(stage: string, work: () => Promise<T>) => {
      await progress(stage, currentStage, totalStages);
      const value = await work();
      currentStage += 1;
      await progress(stage, currentStage, totalStages);
      return value;
    };

    await fs.mkdir(root, { recursive: true });
    try {
      await runStage('schemas', () => this.writeSchemasAndGuides(root));

      const user = await runStage('account', () =>
        this.writeAccountDatasets(job, root, catalog),
      );
      await runStage('activities', () =>
        this.writeActivityDatasets(job, root, catalog),
      );
      await runStage('activity-laps', () =>
        this.writeActivityLapDataset(job, root, catalog),
      );
      await runStage('activity-zones', () =>
        this.writeActivityZoneDataset(job, root, catalog),
      );
      await runStage('activity-metrics', () =>
        this.writeActivityMetricDataset(job, root, catalog),
      );
      await runStage('activity-strength', () =>
        this.writeActivityStrengthDataset(job, root, catalog),
      );
      await runStage('health', () =>
        this.writeHealthDatasets(job, root, catalog),
      );
      await runStage('training-plans', () =>
        this.writeTrainingDatasets(job, root, catalog),
      );
      await runStage('competitions', () =>
        this.writeCompetitionDataset(job, root, catalog),
      );
      await runStage('training-load', () =>
        this.writePmcDataset(job, root, catalog),
      );
      await runStage('activity-series', () =>
        this.exportActivitySeries(job, root, catalog, warnings),
      );
      await runStage('health-series', () =>
        this.exportHealthSeries(job, root, catalog, warnings),
      );
      await runStage('original-files', async () => {
        if (job.includeOriginalFiles) {
          await this.exportOriginalActivityFiles(job, root, catalog, warnings);
        }
      });

      await runStage('manifest', async () => {
        await this.writeJson(
          path.join(root, '00_READ_ME_FIRST/dataset-catalog.json'),
          {
            format: USER_DATA_EXPORT_FORMAT,
            datasets: catalog,
          },
        );
        await this.writeOverview(root, catalog, user, job);
        const files = await this.collectIntegrityEntries(root);
        this.assertArchiveBoundary(files);
        await this.writeJson(path.join(root, 'manifest.json'), {
          format: USER_DATA_EXPORT_FORMAT,
          exportId: job.id,
          mode: job.mode,
          generatedAt: new Date().toISOString(),
          dataCutoffAt: job.dataCutoffAt.toISOString(),
          locationPrivacy: job.locationPrivacy,
          includeOriginalFiles: job.includeOriginalFiles,
          identityRedacted: job.mode === 'AI_ANALYSIS',
          exclusions: [...USER_DATA_EXPORT_EXCLUSIONS],
          warnings,
          files,
        });
      });

      await runStage('packaging', () => this.createZip(root, archivePath));

      return {
        archivePath,
        workingDirectory,
        fileName: `trainingload-export-${job.mode.toLowerCase()}-${job.requestedAt
          .toISOString()
          .slice(0, 10)}-${job.id.slice(-8)}.zip`,
        warnings,
      };
    } catch (error) {
      await fs.rm(workingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async cleanup(result: Pick<BuildResult, 'workingDirectory'>) {
    await fs.rm(result.workingDirectory, { recursive: true, force: true });
  }

  async cleanupStaleWorkingDirectories(maxAgeMs = 24 * 60 * 60 * 1000) {
    const directory = tmpdir();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const cutoff = Date.now() - maxAgeMs;
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        !entry.name.startsWith('trainingload-user-export-')
      ) {
        continue;
      }
      const workingDirectory = path.join(directory, entry.name);
      try {
        const stat = await fs.stat(workingDirectory);
        if (stat.mtimeMs < cutoff) {
          await fs.rm(workingDirectory, { recursive: true, force: true });
        }
      } catch (error) {
        this.logger.warn(
          `Could not inspect stale export working directory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async writeSchemasAndGuides(root: string) {
    const schemaDirectory = path.join(root, '01_SCHEMAS');
    const guideDirectory = path.join(root, '00_READ_ME_FIRST');
    await fs.mkdir(schemaDirectory, { recursive: true });
    await fs.mkdir(guideDirectory, { recursive: true });
    await Promise.all(
      Object.entries(USER_DATA_EXPORT_SCHEMAS).map(([id, schema]) =>
        this.writeJson(path.join(schemaDirectory, `${id}.schema.json`), schema),
      ),
    );
    await fs.writeFile(
      path.join(root, '00_READ_ME_FIRST/README_FOR_AI.md'),
      USER_DATA_EXPORT_README_FOR_AI,
      'utf8',
    );
    await fs.writeFile(
      path.join(root, '00_READ_ME_FIRST/analysis-guide.md'),
      USER_DATA_EXPORT_ANALYSIS_GUIDE,
      'utf8',
    );
    await fs.writeFile(
      path.join(root, '00_READ_ME_FIRST/privacy-and-safety.md'),
      USER_DATA_EXPORT_PRIVACY_GUIDE,
      'utf8',
    );
  }

  private async writeAccountDatasets(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const [user, latestTimezone] = await Promise.all([
      this.users.users().findUniqueOrThrow({
        where: { id: job.userId },
        select: {
          id: true,
          name: true,
          email: true,
          preferredLocale: true,
          registrationPlatform: true,
          registrationMethod: true,
          acquisitionSource: true,
          createdAt: true,
          updatedAt: true,
          userProfile: {
            select: {
              loadSources: true,
              preferredSports: true,
              altitudeOptimizationModel: true,
              altitudeThreshold: true,
              defaultVdotSource: true,
              vo2maxCorrectionFactor: true,
              heartRateZoneModel: true,
              paceZoneModel: true,
              powerZoneModel: true,
            },
          },
        },
      }),
      this.users.bodyMetrics().findFirst({
        where: {
          userId: job.userId,
          type: 'TIMEZONE',
          createdAt: { lte: job.dataCutoffAt },
        },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        select: { value: true },
      }),
    ]);
    await this.writeJsonDataset({
      root,
      catalog,
      id: 'user-profile',
      path: '02_PROFILE/account.json',
      schemaId: 'user-profile',
      description: 'The privacy-reviewed user and training profile snapshot.',
      primaryKey: ['userId'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? ['Direct display name and email fields were replaced with null.']
          : [],
      value: {
        userId:
          job.mode === 'AI_ANALYSIS'
            ? createHash('sha256')
                .update(`${job.id}\u0000${user.id}`)
                .digest('hex')
                .slice(0, 24)
            : user.id,
        displayName: job.mode === 'AI_ANALYSIS' ? null : user.name,
        email: job.mode === 'AI_ANALYSIS' ? null : user.email,
        preferredLocale: user.preferredLocale,
        registrationPlatform: user.registrationPlatform,
        registrationMethod: user.registrationMethod,
        acquisitionSource: user.acquisitionSource,
        timezone: latestTimezone?.value ?? null,
        loadSources: user.userProfile?.loadSources ?? null,
        preferredSports: user.userProfile?.preferredSports ?? null,
        altitudeOptimizationModel:
          user.userProfile?.altitudeOptimizationModel ?? null,
        altitudeThresholdMeters: user.userProfile?.altitudeThreshold ?? null,
        defaultVdotSource: user.userProfile?.defaultVdotSource ?? null,
        vo2maxCorrectionFactor:
          user.userProfile?.vo2maxCorrectionFactor ?? null,
        heartRateZoneModel: user.userProfile?.heartRateZoneModel ?? null,
        paceZoneModel: user.userProfile?.paceZoneModel ?? null,
        powerZoneModel: user.userProfile?.powerZoneModel ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });

    const [
      settings,
      autoUpdateSettings,
      bodyMetrics,
      fitnessMetrics,
      zoneSettings,
      zoneSettingVersions,
      athleteMemoryFacts,
    ] = await Promise.all([
      this.users.settings().findMany({
        where: {
          userId: job.userId,
          createdAt: { lte: job.dataCutoffAt },
        },
        orderBy: { category: 'asc' },
      }),
      this.prisma.userAutoUpdateConfig.findMany({
        where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
        orderBy: { metric: 'asc' },
      }),
      this.users.bodyMetrics().findMany({
        where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
        orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.users.fitnessMetrics().findMany({
        where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
        orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.userZoneSetting.findMany({
        where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
        include: { zones: { orderBy: { order: 'asc' } } },
        orderBy: [{ sportType: 'asc' }, { zoneType: 'asc' }],
      }),
      this.prisma.userZoneSettingVersion.findMany({
        where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
        orderBy: [
          { sportType: 'asc' },
          { zoneType: 'asc' },
          { createdAt: 'asc' },
        ],
      }),
      this.prisma.athleteMemoryFact.findMany({
        where: {
          userId: job.userId,
          createdAt: { lte: job.dataCutoffAt },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'user-settings',
      path: '02_PROFILE/preferences.jsonl',
      schemaId: 'user-setting',
      description:
        'User-configurable application preferences without generated AI content or entitlement metadata.',
      primaryKey: ['category'],
      rows: settings
        .filter((item) => isPublicUserSettingCategory(item.category))
        .map((item) => ({
          category: item.category,
          value: item.value,
          updatedAt: item.updatedAt.toISOString(),
        })),
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'athlete-memory',
      path: '02_PROFILE/athlete-memory.jsonl',
      schemaId: 'athlete-memory',
      description:
        'User-visible cross-conversation memory facts, including event time and lifecycle state. Source conversation text and model reasoning are excluded.',
      primaryKey: ['id'],
      redactions: [
        'Source message identifiers, raw conversation text, extraction jobs, and model reasoning are excluded.',
      ],
      rows: athleteMemoryFacts.map((item) => ({
        id: item.id,
        kind: item.kind,
        category: item.category,
        claim: item.claim,
        status: item.status,
        epistemicStatus: item.epistemicStatus,
        confidence: item.confidence,
        eventStart: iso(item.eventStart),
        eventEnd: iso(item.eventEnd),
        timeText: item.timeText,
        timezone: item.timezone,
        validFrom: iso(item.validFrom),
        validUntil: iso(item.validUntil),
        decayProfile: item.decayProfile,
        version: item.version,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'auto-update-settings',
      path: '02_PROFILE/auto-update-settings.jsonl',
      schemaId: 'auto-update-setting',
      description:
        'User-controlled automatic update preferences for fitness metrics.',
      primaryKey: ['metricType'],
      rows: autoUpdateSettings.map((item) => ({
        metricType: item.metric,
        enabled: item.enabled,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'body-metrics',
      path: '02_PROFILE/body-metrics.jsonl',
      schemaId: 'body-metric',
      description:
        'The complete dated history of body and demographic metrics.',
      primaryKey: ['id'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? ['External source identifiers were replaced with null.']
          : [],
      rows: bodyMetrics.map((item) => ({
        id: item.id,
        type: item.type,
        value: item.value,
        unit: BODY_METRIC_UNITS[item.type] ?? null,
        effectiveDate: item.effectiveDate.toISOString(),
        createdAt: item.createdAt.toISOString(),
        source: item.changeSource,
        provider: item.originProvider,
        sourceExternalId:
          job.mode === 'AI_ANALYSIS' ? null : item.originExternalId,
        sourceUpdatedAt: iso(item.originSyncedAt),
      })),
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'fitness-metrics',
      path: '02_PROFILE/fitness-metrics.jsonl',
      schemaId: 'fitness-metric',
      description: 'The complete dated history of physiological benchmarks.',
      primaryKey: ['id'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? ['External source identifiers were replaced with null.']
          : [],
      rows: fitnessMetrics.map((item) => ({
        id: item.id,
        type: item.type,
        value: item.value,
        unit: FITNESS_METRIC_UNITS[item.type]?.primary ?? null,
        secondaryValue: item.value2,
        secondaryUnit: FITNESS_METRIC_UNITS[item.type]?.secondary ?? null,
        sportType: item.sport,
        effectiveDate: item.recordedAt.toISOString(),
        metricSource: item.source,
        source: item.changeSource,
        provider: item.originProvider,
        sourceExternalId:
          job.mode === 'AI_ANALYSIS' ? null : item.originExternalId,
        sourceUpdatedAt: iso(item.originSyncedAt),
      })),
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'zone-settings',
      path: '02_PROFILE/zone-settings.jsonl',
      schemaId: 'zone-setting',
      description: 'The current normalized heart-rate, pace, and power zones.',
      primaryKey: ['id'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? ['External source identifiers were replaced with null.']
          : [],
      rows: zoneSettings.map((item) => ({
        id: `${item.sportType}:${item.zoneType}`,
        sportType: item.sportType,
        zoneType: item.zoneType,
        benchmark: item.benchmark,
        zones: item.zones.map((zone) => ({
          order: zone.order,
          name: zone.name,
          min: zone.min,
          max: zone.max,
          color: zone.color,
        })),
        effectiveFrom: item.createdAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        source: item.changeSource,
        provider: item.originProvider,
        sourceExternalId:
          job.mode === 'AI_ANALYSIS' ? null : item.originExternalId,
        sourceUpdatedAt: iso(item.originSyncedAt),
      })),
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'zone-setting-history',
      path: '02_PROFILE/zone-setting-history.jsonl',
      schemaId: 'zone-setting',
      description:
        'The complete historical versions of heart-rate, pace, and power zone settings.',
      primaryKey: ['id'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? ['External source identifiers were replaced with null.']
          : [],
      rows: zoneSettingVersions.map((item) => ({
        id: `zone-version:${item.sportType}:${item.zoneType}:${item.createdAt.toISOString()}`,
        sportType: item.sportType,
        zoneType: item.zoneType,
        benchmark: item.benchmark,
        zones: item.zones,
        effectiveFrom: item.createdAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        source: item.changeSource,
        provider: item.originProvider,
        sourceExternalId:
          job.mode === 'AI_ANALYSIS' ? null : item.originExternalId,
        sourceUpdatedAt: null,
      })),
    });
    return user;
  }

  private async writeActivityDatasets(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const activities = await this.prisma.activity.findMany({
      where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
      include: {
        mergedIntoActivity: { select: { hashId: true } },
        coggan: {
          select: {
            isopower: true,
            bikeStress: true,
            intensityFactor: true,
          },
        },
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
    });
    const activityRows = activities.map((activity) => ({
      id: activity.hashId,
      name: activity.activityName,
      sportType: activity.sportType ?? 'UNKNOWN',
      startTime: iso(activity.startTime ?? activity.timestamp),
      timezone: activity.timezone,
      elapsedTimeSeconds: activity.elapsedTime,
      movingTimeSeconds: activity.timerTime,
      distanceMeters: activity.distance,
      elevationGainMeters: activity.enhancedAscent ?? activity.ascent,
      elevationLossMeters: activity.enhancedDescent ?? activity.descent,
      caloriesKilocalories: activity.calories,
      averageHeartRateBpm: activity.avgHeartRate,
      maximumHeartRateBpm: activity.maxHeartRate,
      averagePowerWatts: activity.avgPower,
      normalizedPowerWatts: activity.coggan?.isopower ?? null,
      averageCadenceRpm: activity.avgCadence,
      trainingStressScore: activity.coggan?.bikeStress ?? null,
      intensityFactor: activity.coggan?.intensityFactor ?? null,
      perceivedExertion: activity.sessionRpe,
      notes: activity.description,
      // Activities are not currently linked to competition events, so a race
      // flag would be an unsupported inference rather than exported user data.
      isRace: null,
      isVisible: activity.state === 1,
      status: activity.status,
      mergedIntoActivityId: activity.mergedIntoActivity?.hashId ?? null,
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
      source: activity.thirdPartyProvider,
      sourceExternalId:
        job.mode === 'AI_ANALYSIS' ? null : activity.thirdPartyActivityId,
      sourceUpdatedAt: iso(activity.syncedAt),
    }));
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'activities',
      path: '03_ACTIVITIES/activities.jsonl',
      schemaId: 'activity',
      description: 'Normalized summaries for all user-owned activities.',
      primaryKey: ['id'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? ['External source identifiers were replaced with null.']
          : [],
      rows: activityRows,
    });
    await this.writeCsvDataset({
      root,
      catalog,
      id: 'activity-summary',
      path: '03_ACTIVITIES/activity-summary.csv',
      schemaId: 'activity',
      description: 'Compact activity summaries for direct analysis.',
      primaryKey: ['id'],
      headers: [
        'id',
        'sportType',
        'startTime',
        'elapsedTimeSeconds',
        'movingTimeSeconds',
        'distanceMeters',
        'elevationGainMeters',
        'caloriesKilocalories',
        'averageHeartRateBpm',
        'maximumHeartRateBpm',
        'averagePowerWatts',
        'normalizedPowerWatts',
        'averageCadenceRpm',
        'trainingStressScore',
        'intensityFactor',
        'perceivedExertion',
      ],
      rows: activityRows,
    });
  }

  private async activityIdMap(job: UserDataExportJob) {
    const rows = await this.prisma.activity.findMany({
      where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
      select: { id: true, hashId: true, distance: true },
    });
    return new Map(rows.map((row) => [row.id, row] as const));
  }

  private async writeActivityLapDataset(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const activityMap = await this.activityIdMap(job);
    const rows = await this.prisma.activityLap.findMany({
      where: { activityId: { in: [...activityMap.keys()] } },
      orderBy: [{ activityId: 'asc' }, { index: 'asc' }, { id: 'asc' }],
    });
    const lapPositions = new Map<number, number>();
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'activity-laps',
      path: '03_ACTIVITIES/laps.jsonl',
      schemaId: 'activity-lap',
      description: 'Normalized laps and splits for exported activities.',
      primaryKey: ['activityId', 'lapIndex'],
      relations: [
        {
          fields: ['activityId'],
          dataset: 'activities',
          referencedFields: ['id'],
        },
      ],
      rows: rows.map((lap) => {
        const fallbackIndex = lapPositions.get(lap.activityId) ?? 0;
        lapPositions.set(lap.activityId, fallbackIndex + 1);
        return {
          activityId: activityMap.get(lap.activityId)?.hashId,
          lapIndex: String(lap.index ?? fallbackIndex),
          startTime: iso(lap.startTime ?? lap.timestamp),
          elapsedTimeSeconds: lap.elapsedTime,
          movingTimeSeconds: lap.timerTime,
          distanceMeters: lap.distance,
          averageHeartRateBpm: lap.avgHeartRate,
          maximumHeartRateBpm: lap.maxHeartRate,
          averagePowerWatts: lap.avgPower,
          averageCadenceRpm: lap.avgCadence,
        };
      }),
    });
  }

  private async writeActivityZoneDataset(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const activityMap = await this.activityIdMap(job);
    const rows = await this.prisma.activityZone.findMany({
      where: { activityId: { in: [...activityMap.keys()] } },
      orderBy: [{ activityId: 'asc' }, { zoneType: 'asc' }, { order: 'asc' }],
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'activity-zones',
      path: '03_ACTIVITIES/zones.jsonl',
      schemaId: 'activity-zone',
      description: 'Time distributions across activity intensity zones.',
      primaryKey: ['activityId', 'zoneType', 'zoneIndex'],
      relations: [
        {
          fields: ['activityId'],
          dataset: 'activities',
          referencedFields: ['id'],
        },
      ],
      rows: rows.map((zone) => ({
        activityId: activityMap.get(zone.activityId)?.hashId,
        zoneType: zone.zoneType,
        zoneIndex: zone.order,
        zoneName: zone.name,
        lowerBound: zone.min,
        upperBound: zone.max,
        durationSeconds: zone.duration,
        distanceMeters: null,
        percent: zone.percent,
        averageValue: zone.avg,
      })),
    });
  }

  private async writeActivityMetricDataset(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const activityMap = await this.activityIdMap(job);
    const activityIds = [...activityMap.keys()];
    const [
      coggan,
      bike,
      swim,
      govss,
      calculatedPower,
      trimp,
      vo2,
      effect,
      peaks,
      performances,
    ] = await Promise.all([
      this.prisma.activityCoggan.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityBikeScore.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activitySwimScore.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityGOVSS.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityCalculatedPower.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityTrimp.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityVO2Max.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityTrainingEffect.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityPeakMetric.findMany({
        where: { activityId: { in: activityIds } },
      }),
      this.prisma.activityPerformanceTT.findMany({
        where: { activityId: { in: activityIds } },
      }),
    ]);
    const rows: Array<Record<string, unknown>> = [];
    const addObjectMetrics = (
      activityId: number,
      prefix: string,
      value: Record<string, unknown>,
    ) => {
      const publicId = activityMap.get(activityId)?.hashId;
      if (!publicId) return;
      const algorithm = `TRAININGLOAD.${prefix}`;
      const calculatedAt =
        value.calculatedAt instanceof Date
          ? value.calculatedAt.toISOString()
          : null;
      for (const [key, metricValue] of Object.entries(value)) {
        if (
          ['id', 'activityId'].includes(key) ||
          typeof metricValue !== 'number' ||
          !Number.isFinite(metricValue)
        )
          continue;
        const metricType = `${prefix}.${key}`;
        rows.push({
          activityId: publicId,
          metricType,
          value: metricValue,
          unit: ACTIVITY_METRIC_UNITS[metricType] ?? null,
          durationSeconds: null,
          distanceMeters: null,
          metadata: { sportType: value.sport ?? null },
          source: 'TRAININGLOAD',
          algorithm,
          algorithmVersion: 'legacy-unversioned',
          calculatedAt,
        });
      }
    };
    for (const item of coggan)
      addObjectMetrics(item.activityId, 'COGGAN', item);
    for (const item of bike)
      addObjectMetrics(item.activityId, 'BIKE_SCORE', item);
    for (const item of swim)
      addObjectMetrics(item.activityId, 'SWIM_SCORE', item);
    for (const item of govss) addObjectMetrics(item.activityId, 'GOVSS', item);
    for (const item of calculatedPower) {
      const publicId = activityMap.get(item.activityId)?.hashId;
      if (!publicId) continue;
      for (const [metricType, value] of [
        ['CALCULATED_POWER.avgPower', item.avgPower],
        ['CALCULATED_POWER.maxPower', item.maxPower],
        ['CALCULATED_POWER.sampleCount', item.sampleCount],
      ] as const) {
        if (value == null || !Number.isFinite(value)) continue;
        rows.push({
          activityId: publicId,
          metricType,
          value,
          unit: metricType.endsWith('Power') ? 'W' : 'count',
          durationSeconds: null,
          distanceMeters: null,
          metadata: {
            sportType: item.sport,
            parameters: item.parameters,
          },
          source: 'CALCULATED',
          algorithm: item.model,
          algorithmVersion: String(item.modelVersion),
          calculatedAt: item.calculatedAt.toISOString(),
        });
      }
    }
    for (const item of trimp) addObjectMetrics(item.activityId, 'TRIMP', item);
    for (const item of vo2) addObjectMetrics(item.activityId, 'VO2_MAX', item);
    for (const item of effect)
      addObjectMetrics(item.activityId, 'TRAINING_EFFECT', item);
    for (const item of peaks) {
      rows.push({
        activityId: activityMap.get(item.activityId)?.hashId,
        metricType: `PEAK.${item.type}`,
        value: item.value,
        unit: item.type === 'power' ? 'W' : item.type === 'hr' ? 'bpm' : 'm/s',
        durationSeconds: item.scaleType === 'TIME' ? item.scaleValue : null,
        distanceMeters: item.scaleType === 'DISTANCE' ? item.scaleValue : null,
        metadata: { sportType: item.sport },
        source: 'TRAININGLOAD',
        algorithm: 'TRAININGLOAD.PEAK',
        algorithmVersion: 'legacy-unversioned',
        calculatedAt: item.calculatedAt.toISOString(),
      });
    }
    for (const item of performances) {
      rows.push({
        activityId: activityMap.get(item.activityId)?.hashId,
        metricType: 'TIME_TRIAL_PERFORMANCE',
        value: item.resultTimeSec ?? item.resultDistanceM,
        unit: item.resultTimeSec != null ? 's' : 'm',
        durationSeconds:
          item.targetScaleType === 'TIME'
            ? item.targetScaleValue
            : item.resultTimeSec,
        distanceMeters:
          item.targetScaleType === 'DISTANCE'
            ? item.targetScaleValue
            : item.resultDistanceM,
        metadata: { sportType: item.sport },
        source: 'TRAININGLOAD',
        algorithm: 'TRAININGLOAD.TIME_TRIAL_PERFORMANCE',
        algorithmVersion: 'legacy-unversioned',
        calculatedAt: item.calculatedAt.toISOString(),
      });
    }
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'activity-metrics',
      path: '03_ACTIVITIES/metrics.jsonl',
      schemaId: 'activity-metric',
      description:
        'Derived load, training-effect, peak, and performance metrics.',
      primaryKey: [
        'activityId',
        'metricType',
        'durationSeconds',
        'distanceMeters',
      ],
      relations: [
        {
          fields: ['activityId'],
          dataset: 'activities',
          referencedFields: ['id'],
        },
      ],
      rows,
    });
  }

  private async writeActivityStrengthDataset(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const activityMap = await this.activityIdMap(job);
    const rows = await this.prisma.activityStrengthExercise.findMany({
      where: { activityId: { in: [...activityMap.keys()] } },
      include: { sets: { orderBy: { setIndex: 'asc' } } },
      orderBy: [{ activityId: 'asc' }, { orderIndex: 'asc' }],
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'activity-strength',
      path: '03_ACTIVITIES/strength.jsonl',
      schemaId: 'activity-strength',
      description:
        'Strength exercises and completed sets recorded in activities.',
      primaryKey: ['id'],
      relations: [
        {
          fields: ['activityId'],
          dataset: 'activities',
          referencedFields: ['id'],
        },
      ],
      rows: rows.map((exercise) => ({
        id: exercise.id,
        activityId: activityMap.get(exercise.activityId)?.hashId,
        orderIndex: exercise.orderIndex,
        exerciseCode: exercise.exerciseCode,
        name: exercise.name,
        equipmentCode: exercise.equipmentCode,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => ({
          id: set.id,
          setIndex: set.setIndex,
          setType: set.setType,
          completedReps: set.completedReps,
          completedDurationSeconds: set.completedDurationSeconds,
          loadType: set.loadType,
          loadValue: set.loadValue,
          loadUnit: set.loadUnit,
          actualRpe: set.actualRpe,
          actualRir: set.actualRir,
          completedAt: iso(set.completedAt),
          source: set.source,
        })),
      })),
    });
  }

  private async writeHealthDatasets(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const files = this.healthFiles;
    const [daily, sessions] = await Promise.all([
      files.listExportDailyMetrics(job.userId, job.dataCutoffAt),
      files.listExportSessions(job.userId, job.dataCutoffAt),
    ]);
    const dailyRows = daily.map((item) => ({
      id: item.id,
      localDate: date(item.date),
      metricType: item.metricType,
      value: item.value,
      unit: item.unit,
      provider: item.selectedProvider,
      confidence: null,
      timezone: item.timezone,
      sourceBreakdown: privacyReviewedProvenance(
        item.sourceBreakdown,
        job.mode,
      ),
      recordedAt: item.computedAt.toISOString(),
      source: item.selectedProvider,
      sourceExternalId: null,
      sourceUpdatedAt: item.updatedAt.toISOString(),
    }));
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'health-daily-metrics',
      path: '04_HEALTH/daily-metrics.jsonl',
      schemaId: 'health-daily-metric',
      description: 'Provider-neutral daily health and recovery metrics.',
      primaryKey: ['id'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? [
              'External source identifiers and source or device names in sourceBreakdown were replaced with null.',
            ]
          : [],
      rows: dailyRows,
    });
    await this.writeCsvDataset({
      root,
      catalog,
      id: 'health-daily-summary',
      path: '04_HEALTH/daily-summary.csv',
      schemaId: 'health-daily-metric',
      description: 'Compact daily health metrics for direct analysis.',
      primaryKey: ['id'],
      headers: [
        'id',
        'localDate',
        'metricType',
        'value',
        'unit',
        'provider',
        'confidence',
        'timezone',
        'recordedAt',
      ],
      rows: dailyRows,
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'health-sessions',
      path: '04_HEALTH/sessions.jsonl',
      schemaId: 'health-session',
      description: 'Provider-neutral sleep, nap, stress, and health sessions.',
      primaryKey: ['id'],
      redactions:
        job.mode === 'AI_ANALYSIS'
          ? [
              'Internal connection identifiers were removed; external identifiers and source or device names in sourceBreakdown were replaced with null.',
            ]
          : ['Internal connection identifiers were removed.'],
      rows: sessions.map((item) => ({
        id: item.id,
        sessionType: item.sessionType,
        startTime: item.startTime.toISOString(),
        endTime: item.endTime.toISOString(),
        localDate: date(item.calendarDate),
        timezone: item.timezone,
        durationSeconds: item.durationSeconds,
        score: item.score,
        summary: item.summary,
        provider: item.selectedProvider,
        sourceBreakdown: privacyReviewedProvenance(
          item.sourceBreakdown,
          job.mode,
        ),
        computedAt: item.computedAt.toISOString(),
        source: item.selectedProvider,
        sourceExternalId: null,
        sourceUpdatedAt: item.updatedAt.toISOString(),
      })),
    });
  }

  private async writeTrainingDatasets(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const [plans, workouts] = await Promise.all([
      this.planQuery.findExportPlansCutoff(job.userId, job.dataCutoffAt),
      this.planQuery.findExportWorkoutsCutoff(job.userId, job.dataCutoffAt),
    ]);
    const planSportTypes = new Map<string, Set<string>>();
    for (const workout of workouts) {
      if (!workout.planId) continue;
      const sportTypes =
        planSportTypes.get(workout.planId) ?? new Set<string>();
      sportTypes.add(workout.sportType);
      planSportTypes.set(workout.planId, sportTypes);
    }
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'training-plans',
      path: '05_TRAINING/plans.jsonl',
      schemaId: 'training-plan',
      description: 'User-owned training plans without generation metadata.',
      primaryKey: ['id'],
      rows: plans.map((plan) => ({
        id: plan.id,
        name: plan.title,
        description: plan.description,
        goal: plan.goal,
        sourceType: plan.sourceType,
        sportType:
          planSportTypes.get(plan.id)?.size === 1
            ? [...planSportTypes.get(plan.id)!][0]
            : null,
        periodWeeks: plan.periodWeeks,
        startDate: date(plan.startDate),
        endDate: date(plan.endDate),
        status: plan.status,
        activatedAt: iso(plan.activatedAt),
        pausedAt: iso(plan.pausedAt),
        completedAt: iso(plan.completedAt),
        cancelledAt: iso(plan.cancelledAt),
        currentWeekIndex: plan.currentWeekIndex,
        currentDayIndex: plan.currentDayIndex,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      })),
    });
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'planned-workouts',
      path: '05_TRAINING/planned-workouts.jsonl',
      schemaId: 'planned-workout',
      description: 'Scheduled and reusable workouts from user-owned plans.',
      primaryKey: ['id'],
      relations: [
        {
          fields: ['planId'],
          dataset: 'training-plans',
          referencedFields: ['id'],
        },
      ],
      rows: workouts.map((workout) => ({
        id: workout.id,
        planId: workout.planId,
        name: workout.name ?? workout.text.slice(0, 120),
        description: workout.text,
        notes: workout.notes,
        sportType: workout.sportType,
        sportDefinitionCode: workout.sportDefinitionCode,
        structureKind: workout.structureKind,
        dslVersion: workout.dslVersion,
        scheduledDate: date(workout.scheduledDate),
        status: workout.status,
        targetDurationSeconds: workout.plannedDurationSeconds,
        targetDistanceMeters: null,
        dayOffset: workout.dayOffset,
        sessionIndex: workout.sessionIndex,
        plannedSessionRpe: workout.plannedSessionRpe,
        estimatedLoad: workout.estimatedLoad,
        estimatedLoadSource: workout.estimatedLoadSource,
        estimatedLoadInputs: workout.estimatedLoadInputs,
        estimatedLoadComputedAt: iso(workout.estimatedLoadComputedAt),
        completedAt: iso(workout.completedAt),
        skippedAt: iso(workout.skippedAt),
        createdAt: workout.createdAt.toISOString(),
        updatedAt: workout.updatedAt.toISOString(),
      })),
    });
    const stepRows = workouts.flatMap((workout) => [
      ...workout.steps.map((step) => ({
        id: step.id,
        workoutId: workout.id,
        parentId: step.parentId,
        stepIndex: step.orderIndex,
        stepType: step.stepType,
        durationType: step.durationType,
        durationValue: step.durationValue,
        durationUnit: step.durationUnit,
        targetType: step.targetType,
        targetLow: step.targetValueLow,
        targetHigh: step.targetValueHigh,
        targetUnit: step.targetUnit,
        repetitions: null,
        notes: step.notes,
        metadata: {
          name: step.name,
          intensity: step.intensity,
          targetZoneIndex: step.targetZoneIndex,
          targetZoneLabel: step.targetZoneLabel,
          targetZoneSystem: step.targetZoneSystem,
          targetZoneSource: step.targetZoneSource,
          targetZoneBasis: step.targetZoneBasis,
        },
      })),
      ...workout.strengthExercises.map((exercise) => ({
        id: exercise.id,
        workoutId: workout.id,
        parentId: null,
        stepIndex: exercise.orderIndex,
        stepType: 'STRENGTH_EXERCISE',
        durationType: null,
        durationValue: null,
        durationUnit: null,
        targetType: null,
        targetLow: null,
        targetHigh: null,
        targetUnit: null,
        repetitions: null,
        notes: exercise.notes,
        metadata: {
          exerciseCode: exercise.exerciseCode,
          name: exercise.name,
          equipmentCode: exercise.equipmentCode,
          setGroups: exercise.setGroups.map((group) => ({
            orderIndex: group.orderIndex,
            setType: group.setType,
            setCount: group.setCount,
            prescriptionType: group.prescriptionType,
            repsMin: group.repsMin,
            repsMax: group.repsMax,
            durationSeconds: group.durationSeconds,
            amrap: group.amrap,
            loadType: group.loadType,
            loadValue: group.loadValue,
            loadUnit: group.loadUnit,
            bodyweightOffsetDirection: group.bodyweightOffsetDirection,
            targetRpe: group.targetRpe,
            targetRir: group.targetRir,
            restSeconds: group.restSeconds,
          })),
        },
      })),
    ]);
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'workout-steps',
      path: '05_TRAINING/workout-steps.jsonl',
      schemaId: 'workout-step',
      description: 'Ordered endurance and strength steps for planned workouts.',
      primaryKey: ['id'],
      relations: [
        {
          fields: ['workoutId'],
          dataset: 'planned-workouts',
          referencedFields: ['id'],
        },
      ],
      rows: stepRows,
    });
  }

  private async writeCompetitionDataset(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const rows = await this.competitions.findExportEventsCutoff(
      job.userId,
      job.dataCutoffAt,
    );
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'competitions',
      path: '05_TRAINING/competitions.jsonl',
      schemaId: 'competition',
      description: 'User-maintained target races and competition events.',
      primaryKey: ['id'],
      rows: rows.map((item) => ({
        id: item.id,
        name: item.title,
        sportType: item.sportType,
        sportDefinitionCode: item.sportDefinitionCode,
        startDate: date(item.startDate),
        endDate: date(item.endDate),
        startTimeMinute: item.startTimeMinute,
        timezone: item.timezone,
        distanceMeters: item.distanceMeters,
        priority: item.importance,
        goal: {
          type: item.goalType,
          targetTimeSeconds: item.targetTimeSeconds,
        },
        notes: item.notes,
        status: item.status,
        source: item.source,
        location: item.location,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  }

  private async writePmcDataset(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
  ) {
    const rows = await this.pmc.listExportRows(job.userId, job.dataCutoffAt);
    const dailyRows = rows.map((item) => ({
      date: date(item.date),
      sportType: null,
      chronicTrainingLoad: item.CTL,
      acuteTrainingLoad: item.ATL,
      trainingStressBalance: item.TSB,
      trainingStressScore: item.dailyValue,
      sportBreakdown: {
        cycling: item.cyclingValue,
        running: item.runningValue,
        swimming: item.swimmingValue,
        other: item.otherValue,
      },
      activityCount: item.activityCount,
      totalDurationMinutes: item.totalDuration,
    }));
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'performance-management-chart',
      path: '05_TRAINING/pmc-daily.jsonl',
      schemaId: 'pmc-point',
      description: 'Daily chronic load, acute load, form, and stress values.',
      primaryKey: ['date'],
      rows: dailyRows,
    });
    await this.writeCsvDataset({
      root,
      catalog,
      id: 'pmc-daily-compact',
      path: '05_TRAINING/pmc-daily.csv',
      schemaId: 'pmc-point',
      description: 'Compact daily training load and form values.',
      primaryKey: ['date'],
      headers: [
        'date',
        'chronicTrainingLoad',
        'acuteTrainingLoad',
        'trainingStressBalance',
        'trainingStressScore',
        'activityCount',
        'totalDurationMinutes',
      ],
      rows: dailyRows,
    });

    const weekly = new Map<
      string,
      {
        weekStart: string;
        activityCount: number;
        totalDurationSeconds: number;
        totalTrainingStressScore: number;
        sportBreakdown: Record<string, number>;
      }
    >();
    for (const item of rows) {
      const weekStart = isoWeekStart(item.date);
      const entry = weekly.get(weekStart) ?? {
        weekStart,
        activityCount: 0,
        totalDurationSeconds: 0,
        totalTrainingStressScore: 0,
        sportBreakdown: { cycling: 0, running: 0, swimming: 0, other: 0 },
      };
      entry.activityCount += item.activityCount;
      entry.totalDurationSeconds += item.totalDuration * 60;
      entry.totalTrainingStressScore += item.dailyValue;
      entry.sportBreakdown.cycling += item.cyclingValue ?? 0;
      entry.sportBreakdown.running += item.runningValue ?? 0;
      entry.sportBreakdown.swimming += item.swimmingValue ?? 0;
      entry.sportBreakdown.other += item.otherValue ?? 0;
      weekly.set(weekStart, entry);
    }
    await this.writeCsvDataset({
      root,
      catalog,
      id: 'weekly-summary',
      path: '05_TRAINING/weekly-summary.csv',
      schemaId: 'weekly-summary',
      description: 'Deterministic ISO-week training volume and load summaries.',
      primaryKey: ['weekStart'],
      headers: [
        'weekStart',
        'activityCount',
        'totalDurationSeconds',
        'totalTrainingStressScore',
        'sportBreakdown',
      ],
      rows: [...weekly.values()],
    });
  }

  private async exportActivitySeries(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
    warnings: string[],
  ) {
    const files = await this.sensorFiles.parquetFiles().findMany({
      where: {
        activity: {
          userId: job.userId,
          createdAt: { lte: job.dataCutoffAt },
        },
      },
      include: {
        activity: {
          select: {
            hashId: true,
            distance: true,
            startTime: true,
            endTime: true,
          },
        },
      },
      orderBy: [{ activityId: 'asc' }, { type: 'asc' }],
    });
    const recordOutputDirectory = path.join(root, '03_ACTIVITIES/records');
    const lengthOutputDirectory = path.join(root, '03_ACTIVITIES/lengths');
    const stagingDirectory = path.join(path.dirname(root), 'series-staging');
    await fs.mkdir(recordOutputDirectory, { recursive: true });
    await fs.mkdir(lengthOutputDirectory, { recursive: true });
    await fs.mkdir(stagingDirectory, { recursive: true });
    const { DuckDBInstance } = await loadDuckDBModule();
    const duckdb = await DuckDBInstance.create(':memory:');
    const connection = await duckdb.connect();
    let recordCount = 0;
    let lengthCount = 0;
    const exportedFiles: typeof files = [];
    try {
      for (const [index, file] of files.entries()) {
        const localParquet = path.join(stagingDirectory, `${index}.parquet`);
        try {
          await this.storage.copyFileToPath(file.parquetPath, localParquet);
          const columns = await this.parquetColumns(connection, localParquet);
          const type = file.type === 'length' ? 'length' : 'record';
          const outputPath = path.join(
            type === 'record' ? recordOutputDirectory : lengthOutputDirectory,
            `${safePathPart(file.activity.hashId, String(file.activityId))}-${type}.csv`,
          );
          const query =
            type === 'record'
              ? this.activityRecordSelect({
                  columns,
                  activityId: file.activity.hashId,
                  privacy: job.locationPrivacy,
                  totalDistance: file.activity.distance,
                })
              : this.activityLengthSelect(columns, file.activity.hashId);
          await connection.run(
            `COPY (${query} FROM read_parquet(${sqlString(localParquet)}, union_by_name=true)) TO ${sqlString(outputPath)} (FORMAT CSV, HEADER true)`,
          );
          if (type === 'record') recordCount += file.pointCount;
          else lengthCount += file.pointCount;
          exportedFiles.push(file);
        } catch {
          warnings.push(
            `Activity series is unavailable for activity ${file.activity.hashId}.`,
          );
        } finally {
          await fs.rm(localParquet, { force: true });
        }
        if (shouldLogProgress(index, files.length)) {
          this.logger.log(
            `Export activity series progress job=${job.id} files=${index + 1}/${files.length} recordPoints=${recordCount} lengthPoints=${lengthCount}`,
          );
        }
      }
    } finally {
      connection.disconnectSync?.();
      duckdb.closeSync();
      await fs.rm(stagingDirectory, { recursive: true, force: true });
    }
    catalog.push(
      this.catalogEntry({
        id: 'activity-record-points',
        path: '03_ACTIVITIES/records/',
        schemaId: 'activity-record-point',
        mediaType: CSV_MEDIA_TYPE,
        recordCount,
        description: 'High-frequency activity sensor samples converted to CSV.',
        primaryKey: ['activityId', 'timestamp'],
        relations: [
          {
            fields: ['activityId'],
            dataset: 'activities',
            referencedFields: ['id'],
          },
        ],
        coverage: timeRangeCoverage(
          exportedFiles
            .filter((file) => file.type !== 'length')
            .flatMap((file) => [
              file.activity.startTime,
              file.activity.endTime,
            ]),
        ),
        redactions:
          job.locationPrivacy === 'EXACT'
            ? []
            : job.locationPrivacy === 'REMOVE_GPS'
              ? ['All latitude and longitude values were replaced with null.']
              : [
                  'Latitude and longitude values near activity starts and ends were replaced with null.',
                ],
      }),
    );
    catalog.push(
      this.catalogEntry({
        id: 'activity-lengths',
        path: '03_ACTIVITIES/lengths/',
        schemaId: 'activity-length',
        mediaType: CSV_MEDIA_TYPE,
        recordCount: lengthCount,
        description: 'Pool swimming lengths converted to CSV.',
        primaryKey: ['activityId', 'lengthIndex'],
        relations: [
          {
            fields: ['activityId'],
            dataset: 'activities',
            referencedFields: ['id'],
          },
        ],
        coverage: timeRangeCoverage(
          exportedFiles
            .filter((file) => file.type === 'length')
            .flatMap((file) => [
              file.activity.startTime,
              file.activity.endTime,
            ]),
        ),
      }),
    );
  }

  private activityRecordSelect(args: {
    columns: Set<string>;
    activityId: string;
    privacy: string;
    totalDistance: number | null;
  }) {
    const column = (...names: string[]) => {
      const found = names.find((name) => args.columns.has(name));
      return found ? quotedIdentifier(found) : 'NULL';
    };
    const timestamp = column('timestamp', 'time');
    const distance = column('distance');
    const lat = column('positionLat', 'latitude');
    const lng = column('positionLong', 'longitude');
    const redact = (coordinate: string) => {
      if (args.privacy === 'REMOVE_GPS') return 'NULL';
      if (args.privacy !== 'REDACT_FREQUENT_LOCATIONS') return coordinate;
      if (coordinate === 'NULL' || distance === 'NULL') return 'NULL';
      const end = Math.max(400, Number(args.totalDistance ?? 0) - 400);
      return `CASE WHEN ${distance} <= 400 OR ${distance} >= ${end} THEN NULL ELSE ${coordinate} END`;
    };
    return `SELECT
      ${sqlString(args.activityId)} AS activityId,
      strftime(CAST(${timestamp} AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S.%fZ') AS timestamp,
      NULL AS elapsedSeconds,
      ${redact(lat)} AS latitudeDegrees,
      ${redact(lng)} AS longitudeDegrees,
      COALESCE(${column('enhancedAltitude')}, ${column('altitude')}) AS altitudeMeters,
      ${distance} AS distanceMeters,
      COALESCE(${column('enhancedSpeed')}, ${column('speed')}) AS speedMetersPerSecond,
      ${column('heartRate')} AS heartRateBpm,
      ${column('cadence')} AS cadenceRpm,
      ${column('power')} AS powerWatts,
      ${column('temperature')} AS temperatureCelsius,
      ${column('grade')} AS gradePercent`;
  }

  private activityLengthSelect(columns: Set<string>, activityId: string) {
    const column = (...names: string[]) => {
      const found = names.find((name) => columns.has(name));
      return found ? quotedIdentifier(found) : 'NULL';
    };
    return `SELECT
      ${sqlString(activityId)} AS activityId,
      ${column('index', 'messageIndex')} AS lengthIndex,
      strftime(CAST(${column('timestamp')} AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S.%fZ') AS timestamp,
      strftime(CAST(${column('startTime')} AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S.%fZ') AS startTime,
      ${column('totalElapsedTime')} AS elapsedTimeSeconds,
      ${column('totalTimerTime')} AS timerTimeSeconds,
      ${column('totalStrokes', 'strokeCount')} AS totalStrokes,
      ${column('avgSpeed')} AS averageSpeedMetersPerSecond,
      ${column('swimStroke')} AS strokeType,
      ${column('avgSwimmingCadence')} AS averageCadenceStrokesPerMinute,
      ${column('totalCalories')} AS caloriesKilocalories,
      ${column('lengthType')} AS lengthType`;
  }

  private async exportHealthSeries(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
    warnings: string[],
  ) {
    const files = await this.healthFiles.listExportSeriesFiles(
      job.userId,
      job.dataCutoffAt,
    );
    const outputDirectory = path.join(root, '04_HEALTH/series');
    const stagingDirectory = path.join(
      path.dirname(root),
      'health-series-staging',
    );
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.mkdir(stagingDirectory, { recursive: true });
    const { DuckDBInstance } = await loadDuckDBModule();
    const duckdb = await DuckDBInstance.create(':memory:');
    const connection = await duckdb.connect();
    let exportedCount = 0;
    const exportedFiles: typeof files = [];
    const groups = new Map<
      string,
      {
        metricCode: string;
        provider: string;
        unit: string;
        month: string;
        files: typeof files;
      }
    >();
    for (const file of files) {
      const month = date(file.localDate)?.slice(0, 7) ?? 'unknown-date';
      const key = [file.metricCode, file.provider, file.unit, month].join('\0');
      const group = groups.get(key) ?? {
        metricCode: file.metricCode,
        provider: file.provider,
        unit: file.unit,
        month,
        files: [],
      };
      group.files.push(file);
      groups.set(key, group);
    }
    const groupedFiles = [...groups.entries()];
    const logEvery = Math.max(1, Math.ceil(groupedFiles.length / 10));
    try {
      for (const [groupIndex, [groupKey, group]] of groupedFiles.entries()) {
        const localPaths = group.files.map((_, fileIndex) =>
          path.join(stagingDirectory, `${groupIndex}-${fileIndex}.parquet`),
        );
        const available = new Array<boolean>(group.files.length).fill(false);
        try {
          await forEachWithConcurrency(
            group.files,
            SERIES_DOWNLOAD_CONCURRENCY,
            async (file, fileIndex) => {
              try {
                await this.storage.copyFileToPath(
                  file.parquetPath,
                  localPaths[fileIndex]!,
                );
                available[fileIndex] = true;
              } catch {
                available[fileIndex] = false;
              }
            },
          );
          const readablePaths = localPaths.filter(
            (_, fileIndex) => available[fileIndex],
          );
          const readableFiles = group.files.filter(
            (_, fileIndex) => available[fileIndex],
          );
          const missingCount = group.files.length - readableFiles.length;
          if (missingCount > 0) {
            warnings.push(
              `${missingCount} health series partition(s) are unavailable for ${group.metricCode} in ${group.month}.`,
            );
          }
          if (readablePaths.length === 0) continue;

          const suffix = createHash('sha256')
            .update(groupKey)
            .digest('hex')
            .slice(0, 8);
          const outputPath = path.join(
            outputDirectory,
            `${safePathPart(group.metricCode, 'metric')}-${group.month}-${safePathPart(group.provider, 'provider')}-${suffix}.csv`,
          );
          const parquetList = `[${readablePaths
            .map((filePath) => sqlString(filePath))
            .join(', ')}]`;
          await connection.run(`
            COPY (
              SELECT
                ${sqlString(group.metricCode)} AS metricType,
                strftime(
                  to_timestamp(timestamp_utc_ms / 1000.0) AT TIME ZONE 'UTC',
                  '%Y-%m-%dT%H:%M:%S.%fZ'
                ) AS timestamp,
                CASE WHEN end_timestamp_utc_ms IS NULL THEN NULL
                  ELSE strftime(
                    to_timestamp(end_timestamp_utc_ms / 1000.0) AT TIME ZONE 'UTC',
                    '%Y-%m-%dT%H:%M:%S.%fZ'
                  ) END AS endTime,
                value,
                ${sqlString(group.unit)} AS unit,
                ${sqlString(group.provider)} AS provider,
                status,
                quality,
                source_message AS sourceMessage,
                source_index AS sourceIndex,
                attributes_json AS metadata
              FROM read_parquet(${parquetList}, union_by_name=true)
              ORDER BY timestamp_utc_ms, source_index
            ) TO ${sqlString(outputPath)} (FORMAT CSV, HEADER true)
          `);
          exportedCount += readableFiles.reduce(
            (sum, file) => sum + file.pointCount,
            0,
          );
          exportedFiles.push(...readableFiles);
        } catch {
          warnings.push(
            `Health series is unavailable for ${group.metricCode} from ${group.provider} in ${group.month}.`,
          );
        } finally {
          await Promise.all(
            localPaths.map((filePath) => fs.rm(filePath, { force: true })),
          );
        }
        if (
          groupIndex === 0 ||
          groupIndex + 1 === groupedFiles.length ||
          (groupIndex + 1) % logEvery === 0
        ) {
          this.logger.log(
            `Export health series progress job=${job.id} groups=${groupIndex + 1}/${groupedFiles.length} sourceFiles=${files.length} exportedPoints=${exportedCount}`,
          );
        }
      }
    } finally {
      connection.disconnectSync?.();
      duckdb.closeSync();
      await fs.rm(stagingDirectory, { recursive: true, force: true });
    }
    catalog.push(
      this.catalogEntry({
        id: 'health-series-points',
        path: '04_HEALTH/series/',
        schemaId: 'health-series-point',
        mediaType: CSV_MEDIA_TYPE,
        recordCount: exportedCount,
        description:
          'High-frequency health observations converted to monthly CSV files.',
        primaryKey: ['metricType', 'timestamp', 'provider', 'sourceIndex'],
        coverage: timeRangeCoverage(
          exportedFiles.flatMap((file) => [file.startTime, file.endTime]),
        ),
      }),
    );
  }

  private async exportOriginalActivityFiles(
    job: UserDataExportJob,
    root: string,
    catalog: CatalogEntry[],
    warnings: string[],
  ) {
    const activities = await this.prisma.activity.findMany({
      where: { userId: job.userId, createdAt: { lte: job.dataCutoffAt } },
      include: {
        activitySources: {
          where: { isActive: true },
          include: {
            sourceObject: {
              select: {
                fileName: true,
                fileKey: true,
                rawStorageKey: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
        },
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });
    const outputDirectory = path.join(root, '06_ORIGINAL_FILES/activities');
    await fs.mkdir(outputDirectory, { recursive: true });
    const indexedActivityRows: Array<Record<string, unknown> | null> =
      new Array(activities.length).fill(null);
    const activityWarnings: Array<string | null> = new Array(
      activities.length,
    ).fill(null);
    let completedActivities = 0;
    this.logger.log(
      `Export original activity files started job=${job.id} activities=${activities.length}`,
    );
    await forEachWithConcurrency(
      activities,
      ORIGINAL_FILE_DOWNLOAD_CONCURRENCY,
      async (activity, activityIndex) => {
        const candidates = activity.activitySources
          .map((source) => ({
            key:
              source.fileKey ??
              source.sourceObject?.fileKey ??
              source.sourceObject?.rawStorageKey,
            name:
              source.fileName ??
              source.sourceObject?.fileName ??
              activity.fileName,
            provenance: 'ORIGINAL_SOURCE',
          }))
          .concat(
            activity.fileKey
              ? [
                  {
                    key: activity.fileKey,
                    name: activity.fileName,
                    provenance: 'PRESERVED_CANONICAL',
                  },
                ]
              : [],
          )
          .filter((candidate) => {
            const extension = path.extname(candidate.name ?? '').toLowerCase();
            return (
              candidate.key && ['.fit', '.gpx', '.tcx'].includes(extension)
            );
          });
        let outputPath: string | null = null;
        let provenance = '';
        let fileName = '';
        for (const candidate of candidates) {
          fileName = `${safePathPart(activity.hashId, String(activity.id))}-${safePathPart(
            candidate.name ?? `${activity.hashId}.fit`,
            `${activity.hashId}.fit`,
          )}`;
          outputPath = path.join(outputDirectory, fileName);
          try {
            await this.storage.copyFileToPath(candidate.key!, outputPath);
            provenance = candidate.provenance;
            break;
          } catch {
            outputPath = null;
          }
        }
        if (!outputPath) {
          try {
            const generated = await this.activitiesService.convertByHashId(
              activity.hashId,
              'fit',
              job.userId,
            );
            fileName = `${safePathPart(activity.hashId, String(activity.id))}-generated.fit`;
            outputPath = path.join(outputDirectory, fileName);
            await fs.writeFile(outputPath, generated.content);
            provenance = 'GENERATED_FIT';
          } catch {
            activityWarnings[activityIndex] =
              `No interoperable original file is available for activity ${activity.hashId}.`;
          }
        }
        if (outputPath) {
          const integrity = await this.fileIntegrity(
            outputPath,
            path.relative(root, outputPath),
          );
          indexedActivityRows[activityIndex] = {
            activityId: activity.hashId,
            path: integrity.path,
            format: path.extname(fileName).slice(1).toUpperCase(),
            provenance,
            sizeBytes: integrity.sizeBytes,
            sha256: integrity.sha256,
            warning:
              provenance === 'GENERATED_FIT'
                ? 'This file was reconstructed and may not preserve source-specific fields.'
                : null,
          };
        }
        completedActivities += 1;
        if (shouldLogProgress(completedActivities - 1, activities.length)) {
          this.logger.log(
            `Export original activity files progress job=${job.id} files=${completedActivities}/${activities.length} exported=${indexedActivityRows.filter(Boolean).length}`,
          );
        }
      },
    );
    warnings.push(
      ...activityWarnings.filter((value): value is string => value !== null),
    );
    const activityIndexRows = indexedActivityRows.filter(
      (value): value is Record<string, unknown> => value !== null,
    );
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'original-activity-files',
      path: '06_ORIGINAL_FILES/activity-files.jsonl',
      schemaId: 'original-file',
      description:
        'Integrity and provenance index for interoperable activity files.',
      primaryKey: ['activityId', 'path'],
      relations: [
        {
          fields: ['activityId'],
          dataset: 'activities',
          referencedFields: ['id'],
        },
      ],
      rows: activityIndexRows,
    });
    this.logger.log(
      `Export original activity files completed job=${job.id} exported=${activityIndexRows.length}/${activities.length}`,
    );

    const healthSources = await this.importJobs.sourceObjects().findMany({
      where: {
        userId: job.userId,
        createdAt: { lte: job.dataCutoffAt },
        canonicalHealthSnapshot: { isNot: null },
      },
      select: {
        id: true,
        provider: true,
        fileName: true,
        fileKey: true,
        rawStorageKey: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const healthDirectory = path.join(root, '06_ORIGINAL_FILES/health');
    await fs.mkdir(healthDirectory, { recursive: true });
    const indexedHealthRows: Array<Record<string, unknown> | null> = new Array(
      healthSources.length,
    ).fill(null);
    const healthWarnings: Array<string | null> = new Array(
      healthSources.length,
    ).fill(null);
    let completedHealthSources = 0;
    this.logger.log(
      `Export original health files started job=${job.id} sources=${healthSources.length}`,
    );
    await forEachWithConcurrency(
      healthSources,
      ORIGINAL_FILE_DOWNLOAD_CONCURRENCY,
      async (source, sourceIndex) => {
        const storageKey = source.fileKey ?? source.rawStorageKey;
        if (storageKey) {
          const originalName = source.fileName ?? path.basename(storageKey);
          const extension = path.extname(originalName).toLowerCase();
          if (['.fit', '.json', '.csv', '.xml'].includes(extension)) {
            const fileName = `${safePathPart(source.id, 'health')}-${safePathPart(
              originalName,
              `source${extension || '.bin'}`,
            )}`;
            const outputPath = path.join(healthDirectory, fileName);
            try {
              await this.storage.copyFileToPath(storageKey, outputPath);
              const integrity = await this.fileIntegrity(
                outputPath,
                path.relative(root, outputPath),
              );
              indexedHealthRows[sourceIndex] = {
                recordId: source.id,
                recordType: 'HEALTH_SOURCE',
                path: integrity.path,
                format: extension.slice(1).toUpperCase() || 'BINARY',
                provider: source.provider,
                sizeBytes: integrity.sizeBytes,
                sha256: integrity.sha256,
              };
            } catch {
              healthWarnings[sourceIndex] =
                `Original health source ${source.id} is unavailable.`;
            }
          }
        }
        completedHealthSources += 1;
        if (
          shouldLogProgress(completedHealthSources - 1, healthSources.length)
        ) {
          this.logger.log(
            `Export original health files progress job=${job.id} files=${completedHealthSources}/${healthSources.length} exported=${indexedHealthRows.filter(Boolean).length}`,
          );
        }
      },
    );
    warnings.push(
      ...healthWarnings.filter((value): value is string => value !== null),
    );
    const healthIndexRows = indexedHealthRows.filter(
      (value): value is Record<string, unknown> => value !== null,
    );
    await this.writeJsonlDataset({
      root,
      catalog,
      id: 'original-health-files',
      path: '06_ORIGINAL_FILES/health-files.jsonl',
      schemaId: 'original-source-file',
      description:
        'Integrity and provenance index for preserved health source files.',
      primaryKey: ['recordId', 'path'],
      rows: healthIndexRows,
    });
    this.logger.log(
      `Export original health files completed job=${job.id} exported=${healthIndexRows.length}/${healthSources.length}`,
    );
  }

  private async parquetColumns(
    connection: DuckDBConnection,
    parquetPath: string,
  ) {
    const result = await connection.run(
      `DESCRIBE SELECT * FROM read_parquet(${sqlString(parquetPath)}, union_by_name=true)`,
    );
    const rows = await result.getRows();
    return new Set<string>(
      rows
        .map((row: unknown) =>
          Array.isArray(row)
            ? String(row[0])
            : String(Object.values(row ?? {})[0]),
        )
        .filter(Boolean),
    );
  }

  private async writeOverview(
    root: string,
    catalog: CatalogEntry[],
    user: { id: string; preferredLocale: string | null },
    job: UserDataExportJob,
  ) {
    await this.writeJson(
      path.join(root, '00_READ_ME_FIRST/user-data-overview.json'),
      {
        format: USER_DATA_EXPORT_FORMAT,
        userId:
          job.mode === 'AI_ANALYSIS'
            ? createHash('sha256')
                .update(`${job.id}\u0000${user.id}`)
                .digest('hex')
                .slice(0, 24)
            : user.id,
        preferredLocale: user.preferredLocale,
        datasetCount: catalog.length,
        totalRecordCount: catalog.reduce(
          (sum, item) => sum + item.recordCount,
          0,
        ),
        datasets: catalog.map((item) => ({
          id: item.id,
          recordCount: item.recordCount,
          path: item.path,
          coverage: item.coverage,
          redactions: item.redactions,
        })),
      },
    );
  }

  private async writeJson(filePath: string, value: unknown) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      `${JSON.stringify(jsonSafe(value), null, 2)}\n`,
      'utf8',
    );
  }

  private async writeJsonDataset(args: {
    root: string;
    catalog: CatalogEntry[];
    id: string;
    path: string;
    schemaId: UserDataExportSchemaId;
    description: string;
    primaryKey: string[];
    relations?: CatalogEntry['relations'];
    redactions?: string[];
    value: unknown;
  }) {
    await this.writeJson(path.join(args.root, args.path), args.value);
    args.catalog.push(
      this.catalogEntry({
        ...args,
        mediaType: JSON_MEDIA_TYPE,
        recordCount: 1,
        coverage: datasetCoverage([args.value]),
      }),
    );
  }

  private async writeJsonlDataset(args: {
    root: string;
    catalog: CatalogEntry[];
    id: string;
    path: string;
    schemaId: UserDataExportSchemaId;
    description: string;
    primaryKey: string[];
    relations?: CatalogEntry['relations'];
    redactions?: string[];
    rows: unknown[];
  }) {
    const filePath = path.join(args.root, args.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, { encoding: 'utf8' });
    for (const row of args.rows) {
      if (!stream.write(`${JSON.stringify(jsonSafe(row))}\n`)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve));
      }
    }
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    args.catalog.push(
      this.catalogEntry({
        ...args,
        mediaType: JSONL_MEDIA_TYPE,
        recordCount: args.rows.length,
        coverage: datasetCoverage(args.rows),
      }),
    );
  }

  private async writeCsvDataset(args: {
    root: string;
    catalog: CatalogEntry[];
    id: string;
    path: string;
    schemaId: UserDataExportSchemaId;
    description: string;
    primaryKey: string[];
    relations?: CatalogEntry['relations'];
    redactions?: string[];
    headers: string[];
    rows: Array<Record<string, unknown>>;
  }) {
    const filePath = path.join(args.root, args.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, { encoding: 'utf8' });
    const write = async (line: string) => {
      if (!stream.write(line)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve));
      }
    };
    await write(`${args.headers.map(csvCell).join(',')}\n`);
    for (const row of args.rows) {
      await write(
        `${args.headers.map((header) => csvCell(row[header])).join(',')}\n`,
      );
    }
    stream.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    args.catalog.push(
      this.catalogEntry({
        ...args,
        mediaType: CSV_MEDIA_TYPE,
        recordCount: args.rows.length,
        coverage: datasetCoverage(args.rows),
      }),
    );
  }

  private catalogEntry(args: {
    id: string;
    path: string;
    schemaId: UserDataExportSchemaId;
    mediaType: string;
    recordCount: number;
    description: string;
    primaryKey: string[];
    relations?: CatalogEntry['relations'];
    coverage?: CatalogEntry['coverage'];
    redactions?: string[];
  }): CatalogEntry {
    return {
      id: args.id,
      path: args.path,
      schemaPath: `01_SCHEMAS/${args.schemaId}.schema.json`,
      mediaType: args.mediaType,
      recordCount: args.recordCount,
      description: args.description,
      primaryKey: args.primaryKey,
      relations: args.relations ?? [],
      coverage: args.coverage ?? {
        timeStart: null,
        timeEnd: null,
        missingValueRate: null,
      },
      redactions: args.redactions ?? [],
    };
  }

  private async collectIntegrityEntries(root: string) {
    const paths = await this.walk(root);
    const entries: FileIntegrity[] = [];
    for (const filePath of paths) {
      if (path.basename(filePath) === 'manifest.json') continue;
      entries.push(
        await this.fileIntegrity(filePath, path.relative(root, filePath)),
      );
    }
    return entries;
  }

  private async walk(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const filePath = path.join(directory, entry.name);
        return entry.isDirectory() ? this.walk(filePath) : [filePath];
      }),
    );
    return nested.flat().sort();
  }

  private async fileIntegrity(filePath: string, relativePath: string) {
    const hash = createHash('sha256');
    await pipeline(createReadStream(filePath), hash);
    const stat = await fs.stat(filePath);
    return {
      path: relativePath.split(path.sep).join('/'),
      mediaType: mimeTypeFor(relativePath.toLowerCase()),
      sizeBytes: stat.size.toString(),
      sha256: hash.digest('hex'),
    } satisfies FileIntegrity;
  }

  private assertArchiveBoundary(files: FileIntegrity[]) {
    const forbidden = files.find((file) =>
      file.path.toLowerCase().endsWith('.parquet'),
    );
    if (forbidden) {
      throw new Error(
        `Internal columnar file escaped export boundary: ${forbidden.path}`,
      );
    }
    const forbiddenAiPath = files.find((file) =>
      /(^|\/)(ai|coach)-(conversation|message|review|suggestion)/i.test(
        file.path,
      ),
    );
    if (forbiddenAiPath) {
      throw new Error(
        `AI content escaped export boundary: ${forbiddenAiPath.path}`,
      );
    }
  }

  private async createZip(root: string, destination: string) {
    const output = createWriteStream(destination);
    const archiverModule = await import('archiver');
    const direct = archiverModule as unknown;
    const first = (direct as { default?: unknown })?.default;
    const archiver = (typeof direct === 'function'
      ? direct
      : typeof first === 'function'
        ? first
        : (first as { default?: unknown } | undefined)?.default) as typeof import('archiver');
    if (typeof archiver !== 'function') {
      throw new Error('Archiver runtime did not expose a callable factory');
    }
    const archive = archiver('zip', {
      zlib: { level: 6 },
      forceZip64: true,
    });
    const completed = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('warning', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') reject(error);
        else this.logger.warn(error.message);
      });
      archive.on('error', reject);
    });
    archive.pipe(output);
    archive.directory(root, false);
    await archive.finalize();
    await completed;
  }
}
