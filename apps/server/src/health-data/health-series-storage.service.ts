/**
 * 高频健康时序的持久化边界。
 * Parquet 同时保留测量值和缺失数据状态；关系型元数据负责数量、质量、所有权、
 * 分区身份和对象生命周期。
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBPreparedStatement,
} from '@duckdb/node-api';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import {
  HealthSeriesValueType,
  StorageStrategy,
  type HealthDataProvider,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { HealthDataRepository } from './persistence/health-data.repository';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import { StorageObjectGarbageCollectorService } from '@/sensor/parquet-garbage-collector.service';
import { loadDuckDBModule } from '@/runtime/duckdb-runtime';

/**
 * 健康时序 Parquet 分区中的单条规范记录。
 * 非有效观测会保留用于审计和覆盖率统计，但常规读取只返回
 * `status === 'valid'` 的记录。
 */
export type HealthSeriesParquetRow = {
  /** Point 或 interval 起始绝对时刻，使用 Unix epoch 毫秒。 */
  timestampUtcMs: number;
  /** Interval 的绝对结束时刻，不包含该时刻，使用 Unix epoch 毫秒。 */
  endTimestampUtcMs?: number;
  /** 不带时区后缀的当地墙上时间。 */
  localTimestamp?: string;
  /** 记录起始时刻的 UTC 偏移秒数。 */
  offsetSeconds?: number;
  /** 规范数值；非有效状态时通常不存在。 */
  value?: number;
  /** 测量可用状态，例如 `valid`、`gap` 或 `off_wrist`。 */
  status: string;
  /** 来源提供的置信度。 */
  quality?: number;
  /** 来源数值的统计含义。 */
  aggregation?: string;
  /** 可选的来源活动分类。 */
  activityType?: string;
  /** 可选的来源强度分类。 */
  intensity?: string;
  /** FIT 或 provider 的来源消息名。 */
  sourceMessage: string;
  /** 来源消息的零基索引。 */
  sourceIndex: number;
  /** 附加审计元数据；适用时包含原始 sentinel。 */
  attributes?: Record<string, unknown>;
};

/** 单个用户、快照、指标、本地日期 Parquet 文件的完整写入单元。 */
export type HealthSeriesPartition = {
  /** 所属用户。 */
  userId: string;
  /** 生成本次不可变分区版本的规范快照。 */
  snapshotId: string;
  /** 来源 provider。 */
  provider: HealthDataProvider;
  /** 稳定的 provider、账号或导出命名空间。 */
  sourceNamespace: string;
  /** 与 provider 无关的时序指标代码。 */
  metricCode: string;
  /** 去重时 point 身份和 interval 事件身份采用不同规则。 */
  valueType: 'POINT' | 'INTERVAL';
  /** 分区内全部记录共享的单位。 */
  unit: string;
  /** 使用 UTC 零点表示的数据库本地日期键。 */
  localDate: Date;
  /** 代表性的 UTC 偏移秒数。 */
  offsetSeconds?: number;
  /** 用于本地日期分区的 IANA 时区。 */
  timezone?: string;
  /** 同一日期和指标拆为多个文件时使用的稳定分片号。 */
  part?: number;
  /** 待写入记录，包含非有效状态观测。 */
  rows: HealthSeriesParquetRow[];
};

/**
 * 将高频健康时序存为 Parquet，并在当前快照之间解析有效读取记录。冲突选优依次
 * 比较点置信度、有效覆盖数量、有效比例和新鲜度；interval 会保留来源事件身份。
 */
@Injectable()
export class HealthSeriesStorageService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthSeriesStorageService.name);
  private duckDBPromise?: Promise<DuckDBInstance>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly config: ConfigService,
    private readonly garbageCollector: StorageObjectGarbageCollectorService,
    private readonly health: HealthDataRepository,
  ) {}

  /** 延迟创建进程内用于 Parquet IO 的 DuckDB。 */
  private duckDB() {
    this.duckDBPromise ??= loadDuckDBModule().then(({ DuckDBInstance }) =>
      DuckDBInstance.create(':memory:'),
    );
    return this.duckDBPromise;
  }

  /** 应用关闭时释放延迟创建的内存 DuckDB 实例。 */
  async onModuleDestroy() {
    const duckDB = await this.duckDBPromise;
    duckDB?.closeSync();
  }

  private bindValue(
    prepared: DuckDBPreparedStatement,
    index: number,
    value: unknown,
    type: 'bigint' | 'integer' | 'double' | 'varchar',
  ) {
    if (value === undefined || value === null) {
      prepared.bindNull(index);
      return;
    }
    switch (type) {
      case 'bigint':
        prepared.bindBigInt(index, BigInt(Math.trunc(Number(value))));
        return;
      case 'integer':
        prepared.bindInteger(index, Math.trunc(Number(value)));
        return;
      case 'double':
        prepared.bindDouble(index, Number(value));
        return;
      case 'varchar':
        prepared.bindVarchar(index, String(value));
    }
  }

  /** 将规范记录序列化为临时的 ZSTD 压缩 Parquet 文件。 */
  private async toParquet(rows: HealthSeriesParquetRow[]) {
    if (rows.length === 0) throw new Error('No health series rows to store');
    const duckDB = await this.duckDB();
    const connection = await duckDB.connect();
    const suffix = randomUUID().replace(/-/g, '');
    const tableName = `health_series_${suffix}`;
    const outputPath = path.join(tmpdir(), `${tableName}.parquet`);
    let prepared: DuckDBPreparedStatement | undefined;
    try {
      await connection.run(`
        CREATE TEMP TABLE ${tableName} (
          timestamp_utc_ms BIGINT NOT NULL,
          end_timestamp_utc_ms BIGINT,
          local_timestamp VARCHAR,
          offset_seconds INTEGER,
          value DOUBLE,
          status VARCHAR NOT NULL,
          quality DOUBLE,
          aggregation VARCHAR,
          activity_type VARCHAR,
          intensity VARCHAR,
          source_message VARCHAR NOT NULL,
          source_index INTEGER NOT NULL,
          attributes_json VARCHAR
        )
      `);
      prepared = await connection.prepare(
        `INSERT INTO ${tableName} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const row of rows) {
        this.bindValue(prepared, 1, row.timestampUtcMs, 'bigint');
        this.bindValue(prepared, 2, row.endTimestampUtcMs, 'bigint');
        this.bindValue(prepared, 3, row.localTimestamp, 'varchar');
        this.bindValue(prepared, 4, row.offsetSeconds, 'integer');
        this.bindValue(prepared, 5, row.value, 'double');
        this.bindValue(prepared, 6, row.status, 'varchar');
        this.bindValue(prepared, 7, row.quality, 'double');
        this.bindValue(prepared, 8, row.aggregation, 'varchar');
        this.bindValue(prepared, 9, row.activityType, 'varchar');
        this.bindValue(prepared, 10, row.intensity, 'varchar');
        this.bindValue(prepared, 11, row.sourceMessage, 'varchar');
        this.bindValue(prepared, 12, row.sourceIndex, 'integer');
        this.bindValue(
          prepared,
          13,
          row.attributes ? JSON.stringify(row.attributes) : undefined,
          'varchar',
        );
        await prepared.run();
      }
      const escapedPath = outputPath.replace(/'/g, "''");
      await connection.run(
        `COPY ${tableName} TO '${escapedPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
      );
      return await fs.readFile(outputPath);
    } finally {
      prepared?.destroySync?.();
      await connection
        .run(`DROP TABLE IF EXISTS ${tableName}`)
        .catch(() => undefined);
      connection.disconnectSync?.();
      await fs.unlink(outputPath).catch(() => undefined);
    }
  }

  /**
   * 写入完整分区，记录有效数、总数、最小值和最大值；数据库写入失败时，
   * 将已上传的孤儿对象加入垃圾回收队列。
   */
  async storePartition(partition: HealthSeriesPartition) {
    const rows = [...partition.rows].sort(
      (a, b) =>
        a.timestampUtcMs - b.timestampUtcMs || a.sourceIndex - b.sourceIndex,
    );
    const buffer = await this.toParquet(rows);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const part = partition.part ?? 0;
    const localDate = partition.localDate.toISOString().slice(0, 10);
    const uploaded = await this.storage.uploadFile({
      buffer,
      originalname: `health_${partition.snapshotId}_${partition.metricCode}_${localDate}_${part}.parquet`,
      mimetype: 'application/vnd.apache.parquet',
      size: buffer.length,
    } as Express.Multer.File);
    try {
      const values = rows
        .filter((row) => row.status === 'valid')
        .map((row) => row.value)
        .filter((value): value is number => Number.isFinite(value));
      const data = {
        userId: partition.userId,
        snapshotId: partition.snapshotId,
        provider: partition.provider,
        sourceNamespace: partition.sourceNamespace,
        metricCode: partition.metricCode,
        valueType: partition.valueType,
        unit: partition.unit,
        localDate: partition.localDate,
        startTime: new Date(Math.min(...rows.map((row) => row.timestampUtcMs))),
        endTime: new Date(
          Math.max(
            ...rows.map((row) => row.endTimestampUtcMs ?? row.timestampUtcMs),
          ),
        ),
        offsetSeconds: partition.offsetSeconds,
        timezone: partition.timezone,
        part,
        pointCount: rows.length,
        validPointCount: rows.filter((row) => row.status === 'valid').length,
        minValue: values.length > 0 ? Math.min(...values) : undefined,
        maxValue: values.length > 0 ? Math.max(...values) : undefined,
        parquetPath: uploaded.fileKey,
        parquetSchemaVersion: 'v1',
        fileSize: buffer.length,
        checksum,
        storageStrategy: (this.config.get('STORAGE_STRATEGY') ??
          StorageStrategy.LOCAL) as StorageStrategy,
      };
      return await this.health.runTransaction(async (tx) => {
        const existing = await this.health.seriesFiles(tx).findFirst({
          where: {
            snapshotId: partition.snapshotId,
            metricCode: partition.metricCode,
            localDate: partition.localDate,
            part,
          },
        });
        const record = existing
          ? await this.health.seriesFiles(tx).update({
              where: { id: existing.id },
              data,
            })
          : await this.health.seriesFiles(tx).create({ data });
        if (
          existing?.parquetPath &&
          existing.parquetPath !== uploaded.fileKey
        ) {
          await this.garbageCollector.enqueueObjects(
            [{ objectKey: existing.parquetPath }],
            'health_series_manifest_replaced',
            60 * 60 * 1000,
            tx,
          );
        }
        return record;
      });
    } catch (error) {
      try {
        await this.storage.deleteFile(uploaded.fileKey);
      } catch (cleanupError) {
        await this.garbageCollector
          .enqueueObjects(
            [{ objectKey: uploaded.fileKey }],
            'health_series_manifest_write_failed',
            0,
          )
          .catch((enqueueError) =>
            this.logger.error(
              `[health-series] failed to queue orphan object path=${uploaded.fileKey} deleteError=${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)} enqueueError=${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`,
            ),
          );
      }
      throw error;
    }
  }

  /**
   * 读取指定指标和日期范围内的有效记录，并对重叠快照文件进行确定性去重。
   * 非有效记录继续保留在存储中，但不会返回。
   */
  async readMetricRows(args: {
    userId: string;
    metricCode: string;
    localDates: Date[];
    provider?: HealthDataProvider;
  }): Promise<HealthSeriesParquetRow[]> {
    const files = await this.health.seriesFiles().findMany({
      where: {
        userId: args.userId,
        metricCode: args.metricCode,
        localDate: { in: args.localDates },
        ...(args.provider ? { provider: args.provider } : {}),
        snapshot: {
          manifest: { path: ['status'], equals: 'READY' },
        },
      },
      orderBy: [
        { localDate: 'asc' },
        { part: 'asc' },
        { updatedAt: 'asc' },
        { id: 'asc' },
      ],
      select: {
        parquetPath: true,
        valueType: true,
        pointCount: true,
        validPointCount: true,
      },
    });
    if (files.length === 0) return [];

    const readDir = path.join(tmpdir(), `health-series-read-${randomUUID()}`);
    await fs.mkdir(readDir, { recursive: true });
    let connection: DuckDBConnection | undefined;
    try {
      connection = await (await this.duckDB()).connect();
      const localPaths: Array<{
        fileOrder: number;
        path: string;
        valueType: HealthSeriesValueType;
        datasetCoverage: number;
        datasetQuality: number;
      }> = [];
      for (const [index, file] of files.entries()) {
        const buffer = await this.storage.getFileWithKey(file.parquetPath);
        if (!buffer) {
          this.logger.warn(
            `[health-series] object missing user=${args.userId} metric=${args.metricCode} path=${file.parquetPath}`,
          );
          continue;
        }
        const localPath = path.join(readDir, `${index}.parquet`);
        await fs.writeFile(localPath, buffer);
        localPaths.push({
          fileOrder: index,
          path: localPath,
          valueType: file.valueType,
          datasetCoverage: file.validPointCount,
          datasetQuality:
            file.pointCount > 0 ? file.validPointCount / file.pointCount : 0,
        });
      }
      if (localPaths.length === 0) return [];

      const localFileByOrder = new Map(
        localPaths.map((file) => [file.fileOrder, file] as const),
      );

      const parquetPaths = localPaths
        .map(({ path: localPath }) => `'${localPath.replace(/'/g, "''")}'`)
        .join(', ');
      const result = await connection.run(`
        SELECT
          timestamp_utc_ms,
          end_timestamp_utc_ms,
          local_timestamp,
          offset_seconds,
          value,
          status,
          quality,
          aggregation,
          activity_type,
          intensity,
          source_message,
          source_index,
          attributes_json,
          filename
        FROM read_parquet([${parquetPaths}], union_by_name=true, filename=true)
        WHERE status = 'valid'
        ORDER BY timestamp_utc_ms, source_index
      `);
      const rows = await result.getRows();
      const deduped = new Map<
        string,
        {
          row: HealthSeriesParquetRow;
          fileOrder: number;
          datasetCoverage: number;
          datasetQuality: number;
        }
      >();
      for (const row of rows) {
        const values = Array.isArray(row) ? row : Object.values(row);
        const timestampUtcMs = Number(values[0]);
        if (!Number.isFinite(timestampUtcMs)) continue;
        const endTimestampUtcMs =
          values[1] == null ? undefined : Number(values[1]);
        const candidate: HealthSeriesParquetRow = {
          timestampUtcMs,
          endTimestampUtcMs,
          localTimestamp: values[2] == null ? undefined : String(values[2]),
          offsetSeconds: values[3] == null ? undefined : Number(values[3]),
          value: values[4] == null ? undefined : Number(values[4]),
          status: String(values[5]),
          quality: values[6] == null ? undefined : Number(values[6]),
          aggregation: values[7] == null ? undefined : String(values[7]),
          activityType: values[8] == null ? undefined : String(values[8]),
          intensity: values[9] == null ? undefined : String(values[9]),
          sourceMessage: String(values[10]),
          sourceIndex: Number(values[11]),
          attributes: this.parseAttributes(values[12]),
        };
        const filename = values[13] == null ? '' : String(values[13]);
        const fileOrder = Number(path.basename(filename, '.parquet'));
        const stableFileOrder = Number.isFinite(fileOrder) ? fileOrder : -1;
        const localFile = localFileByOrder.get(stableFileOrder);
        const valueType = localFile?.valueType;
        const datasetQuality = localFile?.datasetQuality ?? 0;
        const datasetCoverage = localFile?.datasetCoverage ?? 0;
        // Point 指标每个时刻最多选中一条记录；interval 在同一时间范围内可能合法地
        // 包含多个来源事件，因此来源指针属于事件身份。
        const key =
          valueType === HealthSeriesValueType.INTERVAL
            ? `${timestampUtcMs}|${endTimestampUtcMs ?? timestampUtcMs}|${candidate.sourceMessage}|${candidate.sourceIndex}`
            : `${timestampUtcMs}|${endTimestampUtcMs ?? timestampUtcMs}`;
        const existing = deduped.get(key);
        const candidateQuality = candidate.quality ?? 0;
        const existingQuality = existing?.row.quality ?? 0;
        // 跨快照冲突优先比较测量置信度，其次比较数据集覆盖数量和有效比例，
        // 最后才比较来源新鲜度。
        if (
          !existing ||
          candidateQuality > existingQuality ||
          (candidateQuality === existingQuality &&
            datasetCoverage > existing.datasetCoverage) ||
          (candidateQuality === existingQuality &&
            datasetCoverage === existing.datasetCoverage &&
            datasetQuality > existing.datasetQuality) ||
          (candidateQuality === existingQuality &&
            datasetCoverage === existing.datasetCoverage &&
            datasetQuality === existing.datasetQuality &&
            stableFileOrder > existing.fileOrder) ||
          (candidateQuality === existingQuality &&
            datasetCoverage === existing.datasetCoverage &&
            datasetQuality === existing.datasetQuality &&
            stableFileOrder === existing.fileOrder &&
            candidate.sourceIndex > existing.row.sourceIndex)
        ) {
          deduped.set(key, {
            row: candidate,
            fileOrder: stableFileOrder,
            datasetCoverage,
            datasetQuality,
          });
        }
      }
      return [...deduped.values()]
        .map((entry) => entry.row)
        .sort(
          (a, b) =>
            a.timestampUtcMs - b.timestampUtcMs ||
            (a.endTimestampUtcMs ?? a.timestampUtcMs) -
              (b.endTimestampUtcMs ?? b.timestampUtcMs) ||
            a.sourceIndex - b.sourceIndex,
        );
    } finally {
      connection?.disconnectSync?.();
      await fs.rm(readDir, { recursive: true, force: true });
    }
  }

  /** 仅当 Parquet JSON 单元格内容为对象时才返回解析结果。 */
  private parseAttributes(value: unknown) {
    if (value == null) return undefined;
    try {
      const parsed = JSON.parse(String(value)) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
}
