import * as dotenv from 'dotenv';
import { expand as expandEnv } from 'dotenv-expand';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { Decoder, Stream } from '@garmin/fitsdk';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import TrackSwap, { normalizeFitSemicircleToDegrees } from 'trackswap';
import {
  ACCOUNT_DELETION_LOCAL_DATA,
  type AccountDeletionLocalData,
} from '@/account-lifecycle/account-deletion-local-data.port';
import { LocalAccountProviderLifecycleModule } from '@/api/user/local-account-provider-lifecycle.module';
import { UserQueryService } from '@/api/user/user-query.service';
import { AppModule } from '@/app.module';
import { DisabledExternalProgramImportModule } from '@/deployment/disabled-external-program-import.module';
import { SelfHostAccessModule } from '@/deployment/self-host-access.module';
import { SelfHostAiOperationPersistenceModule } from '@/deployment/self-host-ai-operation-persistence.module';
import { LocalOnboardingCompletionModule } from '@/onboarding/local-onboarding-completion.module';
import { PMCService } from '@/training-load/pmc.service';
import { PMC_INVALIDATE_EVENT } from '@/training-load/events/pmc.events';
import { CoreJobsModule } from '@/workers/core-jobs.module';
import { ImportBatchService } from './import-batch.service';
import { ImportingJobService } from './importing-job.service';

for (const path of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  process.env.FIT_CORPUS_ENV_FILE
    ? resolve(process.env.FIT_CORPUS_ENV_FILE)
    : null,
]) {
  if (!path) continue;
  if (existsSync(path)) expandEnv(dotenv.config({ path }));
}

const EXPECTED_CORPUS_SIZE = 73;
const DEFAULT_CORPUS_ROOT = resolve(
  process.cwd(),
  '../../.local/fit-release-corpus',
);
const TERMINAL_BATCH_STATUSES = new Set([
  'COMPLETED',
  'PARTIAL_FAILED',
  'FAILED',
  'CANCELLED',
]);
const TERMINAL_POST_PROCESS_STATUSES = new Set(['COMPLETED', 'FAILED', 'DEAD']);

const corpusAccountDeletionLocalData: AccountDeletionLocalData = {
  async revokeLocalCredentials() {},
  async beforeUserDeletion() {},
};

@Global()
@Module({
  providers: [
    {
      provide: ACCOUNT_DELETION_LOCAL_DATA,
      useValue: corpusAccountDeletionLocalData,
    },
  ],
  exports: [ACCOUNT_DELETION_LOCAL_DATA],
})
class FitReleaseCorpusDeploymentModule {}

/**
 * 发布语料回归只需要公共业务模块和核心 worker。不要导入 SelfHostModule：
 * 它拥有 owner bootstrap/token 生命周期，与活动计算回归无关且不得由测试工具触发。
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SelfHostAccessModule,
    SelfHostAiOperationPersistenceModule,
    DisabledExternalProgramImportModule,
    LocalOnboardingCompletionModule,
    LocalAccountProviderLifecycleModule,
    FitReleaseCorpusDeploymentModule,
    CoreJobsModule,
    AppModule,
  ],
})
class FitReleaseCorpusAppModule {}

type GarminMessage = Record<string, unknown>;
type GarminMessages = Record<string, GarminMessage[] | undefined>;
type CorpusFact = {
  path: string;
  relativePath: string;
  filename: string;
  buffer: Buffer;
  recordCount: number;
  setCount: number;
};

type Options = {
  corpusRoot: string;
  userId: string | null;
  parityOnly: boolean;
  timeoutMs: number;
};

function optionValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function options(): Options {
  const timeoutMinutes = Number(optionValue('--timeout-minutes') ?? 45);
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new Error('INVALID_TIMEOUT_MINUTES');
  }
  const parityOnly = process.argv.includes('--parity-only');
  const userId = optionValue('--user-id')?.trim() || null;
  if (!parityOnly && !userId) {
    throw new Error('FIT_CORPUS_USER_ID_REQUIRED');
  }
  return {
    corpusRoot: resolve(optionValue('--corpus') ?? DEFAULT_CORPUS_ROOT),
    userId,
    parityOnly,
    timeoutMs: timeoutMinutes * 60_000,
  };
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(path);
      return entry.isFile() && entry.name.toLowerCase().endsWith('.fit')
        ? [path]
        : [];
    }),
  );
  return files.flat().sort();
}

function scalar(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isNaN(value)) return '__NaN__';
  return value;
}

function compareOfficialSubset(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: string[],
) {
  if (differences.length >= 25) return;
  if (expected instanceof Date) {
    if (!(actual instanceof Date) || expected.valueOf() !== actual.valueOf()) {
      differences.push(
        `${path}: ${String(scalar(expected))} != ${String(scalar(actual))}`,
      );
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      differences.push(`${path}: expected array`);
      return;
    }
    if (expected.length !== actual.length) {
      differences.push(
        `${path}.length: ${expected.length} != ${actual.length}`,
      );
      return;
    }
    expected.forEach((value, index) =>
      compareOfficialSubset(
        value,
        actual[index],
        `${path}[${index}]`,
        differences,
      ),
    );
    return;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      differences.push(`${path}: expected object`);
      return;
    }
    for (const key of Object.keys(expected as Record<string, unknown>).sort()) {
      compareOfficialSubset(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        `${path}.${key}`,
        differences,
      );
    }
    return;
  }
  if (!Object.is(expected, actual)) {
    differences.push(
      `${path}: ${JSON.stringify(scalar(expected))} != ${JSON.stringify(scalar(actual))}`,
    );
  }
}

function parseChecksumManifest(value: string) {
  const rows = new Map<string, string>();
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^([a-f0-9]{64})\s{2}(.+)$/i.exec(trimmed);
    if (!match) throw new Error(`INVALID_CHECKSUM_MANIFEST_LINE:${line}`);
    rows.set(match[2], match[1].toLowerCase());
  }
  return rows;
}

async function verifyChecksums(corpusRoot: string, files: string[]) {
  if (files.length !== EXPECTED_CORPUS_SIZE) {
    throw new Error(
      `FIT_CORPUS_FILE_COUNT_MISMATCH:expected=${EXPECTED_CORPUS_SIZE}:actual=${files.length}`,
    );
  }
  const checksumPath = join(corpusRoot, 'checksums.sha256');
  const expected = parseChecksumManifest(await readFile(checksumPath, 'utf8'));
  if (expected.size !== EXPECTED_CORPUS_SIZE) {
    throw new Error(
      `FIT_CORPUS_CHECKSUM_COUNT_MISMATCH:expected=${EXPECTED_CORPUS_SIZE}:actual=${expected.size}`,
    );
  }
  const actualPaths = new Set(files.map((file) => relative(corpusRoot, file)));
  for (const [path, checksum] of expected) {
    if (!actualPaths.has(path))
      throw new Error(`FIT_CORPUS_FILE_MISSING:${path}`);
    const actual = createHash('sha256')
      .update(await readFile(join(corpusRoot, path)))
      .digest('hex');
    if (actual !== checksum)
      throw new Error(`FIT_CORPUS_CHECKSUM_MISMATCH:${path}`);
  }
}

async function verifyDecoderParity(corpusRoot: string, files: string[]) {
  const facts: CorpusFact[] = [];
  const failures: Array<Record<string, unknown>> = [];
  const aggregate = {
    files: files.length,
    bytes: 0,
    officialRecords: 0,
    canonicalRecords: 0,
    officialSets: 0,
    canonicalSets: 0,
    noLapRecordFiles: 0,
    strengthFiles: 0,
    genericFiles: 0,
  };
  const trackSwap = new TrackSwap();
  try {
    for (const path of files) {
      const buffer = await readFile(path);
      aggregate.bytes += (await stat(path)).size;
      const official = new Decoder(Stream.fromBuffer(buffer)).read();
      if (official.errors.length > 0) {
        failures.push({
          file: basename(path),
          stage: 'garmin',
          errors: official.errors,
        });
        continue;
      }
      const document = await trackSwap.decode(buffer, {
        format: 'fit',
        includeNative: true,
      });
      const messages = official.messages as GarminMessages;
      const native = (document.native ?? {}) as Record<string, unknown>;
      const nativeDifferences: string[] = [];
      for (const [messageName, expectedRows] of Object.entries(messages)) {
        if (!Array.isArray(expectedRows) || expectedRows.length === 0) continue;
        compareOfficialSubset(
          expectedRows,
          native[messageName],
          messageName,
          nativeDifferences,
        );
      }
      if (nativeDifferences.length > 0) {
        failures.push({
          file: basename(path),
          stage: 'native-fields',
          differences: nativeDifferences,
        });
      }

      const records = messages.recordMesgs ?? [];
      const sets = messages.setMesgs ?? [];
      const sessions = messages.sessionMesgs ?? [];
      const laps = messages.lapMesgs ?? [];
      const activities = document.facets.activity?.activities ?? [];
      const canonicalRecords = activities.flatMap((activity) =>
        (activity.laps ?? []).flatMap((lap) => lap.records ?? []),
      );
      const canonicalSets = activities.flatMap(
        (activity) =>
          (activity as unknown as { strengthSets?: unknown[] }).strengthSets ??
          [],
      );
      aggregate.officialRecords += records.length;
      aggregate.canonicalRecords += canonicalRecords.length;
      aggregate.officialSets += sets.length;
      aggregate.canonicalSets += canonicalSets.length;
      if (sessions.length > 0 && laps.length === 0 && records.length > 0) {
        aggregate.noLapRecordFiles += 1;
      }
      if (sets.length > 0) aggregate.strengthFiles += 1;
      if (
        sessions.some(
          (session) => String(session.sport).toLowerCase() === 'generic',
        )
      ) {
        aggregate.genericFiles += 1;
      }
      if (records.length !== canonicalRecords.length) {
        failures.push({
          file: basename(path),
          stage: 'record-count',
          official: records.length,
          canonical: canonicalRecords.length,
        });
      }
      const recordDifferences: string[] = [];
      for (
        let index = 0;
        index < Math.min(records.length, canonicalRecords.length);
        index += 1
      ) {
        const expected = records[index];
        const actual = canonicalRecords[index] as unknown as Record<
          string,
          unknown
        >;
        for (const key of Object.keys(expected).sort()) {
          const expectedValue =
            key === 'positionLat' || key === 'positionLong'
              ? normalizeFitSemicircleToDegrees(expected[key] as number)
              : expected[key];
          compareOfficialSubset(
            expectedValue,
            actual[key],
            `recordMesgs[${index}].${key}`,
            recordDifferences,
          );
        }
      }
      if (recordDifferences.length > 0) {
        failures.push({
          file: basename(path),
          stage: 'canonical-record-fields',
          differences: recordDifferences,
        });
      }
      if (sets.length !== canonicalSets.length) {
        failures.push({
          file: basename(path),
          stage: 'strength-count',
          official: sets.length,
          canonical: canonicalSets.length,
        });
      }
      const setDifferences: string[] = [];
      for (
        let index = 0;
        index < Math.min(sets.length, canonicalSets.length);
        index += 1
      ) {
        compareOfficialSubset(
          sets[index],
          canonicalSets[index],
          `setMesgs[${index}]`,
          setDifferences,
        );
      }
      if (setDifferences.length > 0) {
        failures.push({
          file: basename(path),
          stage: 'canonical-set-fields',
          differences: setDifferences,
        });
      }
      facts.push({
        path,
        relativePath: relative(corpusRoot, path),
        filename: basename(path),
        buffer,
        recordCount: records.length,
        setCount: sets.length,
      });
    }
  } finally {
    await trackSwap.dispose();
  }
  if (failures.length > 0) {
    throw new Error(
      `FIT_CORPUS_DECODER_PARITY_FAILED:${JSON.stringify(failures)}`,
    );
  }
  return { aggregate, facts };
}

function multerFile(fact: CorpusFact): Express.Multer.File {
  return {
    fieldname: 'files',
    originalname: fact.filename,
    encoding: '7bit',
    mimetype: 'application/vnd.ant.fit',
    size: fact.buffer.length,
    destination: '',
    filename: fact.filename,
    path: fact.path,
    buffer: fact.buffer,
    stream: Readable.from(fact.buffer),
  };
}

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function checkpointHasPendingPmc(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Boolean(row.pendingPmcRecomputeFrom || row.pendingPmcRecomputeTo);
}

async function verifyFullPipeline(
  userId: string,
  facts: CorpusFact[],
  timeoutMs: number,
  corpusRoot: string,
) {
  process.env.DEPLOYMENT_MODE = 'self-host';
  process.env.SELF_HOST_MODE = 'core-local';
  // 发布语料门禁只验证活动导入与指标链路，不得调用任何外部 AI。
  process.env.AI_PROVIDER = 'none';
  process.env.STORAGE_STRATEGY = 'LOCAL';
  process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000';
  process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:3000';
  process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3000';
  process.env.TRUSTED_ORIGINS = 'http://127.0.0.1:3000';
  process.env.LOCAL_STORAGE_PATH = resolve(
    corpusRoot,
    '..',
    'fit-release-storage',
  );
  const app = await NestFactory.createApplicationContext(
    FitReleaseCorpusAppModule,
    {
      logger: ['error', 'warn'],
    },
  );
  try {
    const events = app.get(EventEmitter2);
    if (events.listenerCount(PMC_INVALIDATE_EVENT) < 1) {
      throw new Error('FIT_CORPUS_PMC_INVALIDATE_LISTENER_MISSING');
    }
    const batches = app.get(ImportBatchService);
    const users = app.get(UserQueryService);
    const jobs = app.get(ImportingJobService);
    const pmc = app.get(PMCService);
    const user = await users.findUserById(userId);
    if (!user) throw new Error(`FIT_CORPUS_USER_NOT_FOUND:${userId}`);

    const batch = await batches.createFileImportBatch({
      userId,
      files: facts.map(multerFile),
      postProcessPolicy: {
        suppressAutomaticAiReview: true,
        suppressAthleteStateReassessment: true,
        suppressThirdPartyExport: true,
      },
    });
    const deadline = Date.now() + timeoutMs;
    let summary = await batches.getBatchSummary(batch.id, userId);
    while (Date.now() < deadline) {
      summary = await batches.getBatchSummary(batch.id, userId);
      const post = summary.postProcessJob;
      if (
        TERMINAL_BATCH_STATUSES.has(summary.status) &&
        (!post || TERMINAL_POST_PROCESS_STATUSES.has(post.status))
      ) {
        break;
      }
      await sleep(1_000);
    }
    if (Date.now() >= deadline) {
      throw new Error(`FIT_CORPUS_PIPELINE_TIMEOUT:${batch.id}`);
    }
    if (summary.status !== 'COMPLETED') {
      throw new Error(
        `FIT_CORPUS_BATCH_FAILED:${batch.id}:${summary.status}:${JSON.stringify(summary)}`,
      );
    }
    if (summary.postProcessJob?.status !== 'COMPLETED') {
      throw new Error(
        `FIT_CORPUS_POST_PROCESS_FAILED:${batch.id}:${summary.postProcessJob?.status ?? 'MISSING'}`,
      );
    }

    const factsByName = new Map(facts.map((fact) => [fact.filename, fact]));
    const items = await jobs.itemJobs().findMany({
      where: { batchJobId: batch.id, userId },
      orderBy: { position: 'asc' },
      include: {
        sourceObject: { select: { fileName: true, rawChecksum: true } },
        activity: {
          include: {
            fitnessMetricsSnapshot: true,
            parquetFiles: true,
          },
        },
      },
    });
    const failures: Array<Record<string, unknown>> = [];
    for (const item of items) {
      const fileName = item.sourceObject.fileName ?? '';
      const fact = factsByName.get(fileName);
      if (!fact) {
        failures.push({ itemId: item.id, stage: 'source-name', fileName });
        continue;
      }
      if (item.status !== 'DONE' || !item.activity) {
        failures.push({
          file: fileName,
          stage: 'item-terminal',
          status: item.status,
          error: item.lastErrorCode,
        });
        continue;
      }
      const activity = item.activity;
      if (activity.processingStatus !== 'READY' || !activity.readyAt) {
        failures.push({
          file: fileName,
          stage: 'activity-ready',
          activityId: activity.id,
          processingStatus: activity.processingStatus,
        });
      }
      const snapshot = activity.fitnessMetricsSnapshot;
      if (
        !snapshot ||
        snapshot.resolutionVersion < 4 ||
        !snapshot.inputFingerprint ||
        !snapshot.contextFingerprint ||
        !snapshot.analysisConfigFingerprint ||
        !snapshot.pmcLocalDate ||
        !snapshot.analysisTimezone
      ) {
        failures.push({
          file: fileName,
          stage: 'snapshot-v4',
          activityId: activity.id,
        });
      }
      if (snapshot?.actualLoad === 0) {
        failures.push({
          file: fileName,
          stage: 'false-zero-load',
          activityId: activity.id,
        });
      }
      if (fact.recordCount > 0) {
        const records = activity.parquetFiles.find(
          (entry) => (entry.type ?? 'record') === 'record',
        );
        if (!records || records.pointCount !== fact.recordCount) {
          failures.push({
            file: fileName,
            stage: 'record-parquet',
            expected: fact.recordCount,
            actual: records?.pointCount ?? null,
          });
        }
      }
    }
    const post = await jobs.postProcessJobs().findUnique({
      where: { batchJobId: batch.id },
      select: { replayCheckpoint: true },
    });
    if (checkpointHasPendingPmc(post?.replayCheckpoint)) {
      failures.push({ stage: 'pmc-checkpoint-not-drained', batchId: batch.id });
    }
    const loadDates = Array.from(
      new Set(
        items
          .map((item) => item.activity?.fitnessMetricsSnapshot)
          .filter((snapshot) => (snapshot?.actualLoad ?? 0) > 0)
          .map((snapshot) => snapshot!.pmcLocalDate)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (loadDates.length > 0) {
      const sortedDates = [...loadDates].sort();
      const pmcRows = await pmc.listRange(
        userId,
        new Date(`${sortedDates[0]}T00:00:00.000Z`),
        new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00.000Z`),
        { select: { date: true, dailyValue: true } },
      );
      const actualDates = new Set(
        pmcRows
          .filter((row) => row.dailyValue > 0)
          .map((row) => row.date.toISOString().slice(0, 10)),
      );
      for (const date of loadDates) {
        if (!actualDates.has(date)) {
          failures.push({ stage: 'pmc-missing', localDate: date });
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(`FIT_CORPUS_PIPELINE_FAILED:${JSON.stringify(failures)}`);
    }
    return {
      batchId: batch.id,
      activities: items.length,
      loadedPmcDates: loadDates.length,
    };
  } finally {
    await app.close();
  }
}

async function main() {
  const resolved = options();
  const files = await filesUnder(resolved.corpusRoot);
  await verifyChecksums(resolved.corpusRoot, files);
  const parity = await verifyDecoderParity(resolved.corpusRoot, files);
  const pipeline = resolved.parityOnly
    ? null
    : await verifyFullPipeline(
        resolved.userId!,
        parity.facts,
        resolved.timeoutMs,
        resolved.corpusRoot,
      );
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        corpusRoot: resolved.corpusRoot,
        checksumEntries: files.length,
        parity: parity.aggregate,
        pipeline,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
    })}\n`,
  );
  process.exitCode = 1;
});
