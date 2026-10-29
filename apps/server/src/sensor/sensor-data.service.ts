import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBPreparedStatement,
} from '@duckdb/node-api';
import * as os from 'os';
import * as path from 'path';
import { promises as fsp } from 'fs';
import * as crypto from 'crypto';
import { ActivityLengthType, ActivityRecordType } from 'trackswap';
import dayjs = require('dayjs');
import { $Enums, Activity } from '@prisma/client';
import { round } from 'lodash';
import { ConfigService } from '@nestjs/config';
import { SensorFileQueryService } from './sensor-file-query.service';
import { loadDuckDBModule } from '@/runtime/duckdb-runtime';

export interface SensorRecord extends ActivityRecordType {
  activityId: number;
  activityHashId?: string;

  // 新增clength字段，用于存储步长
  clength?: number;
  // 保留原有的计算字段
  climb?: number;
  descend?: number;
  // 增强版本的计算字段
  enhancedClimb?: number;
  enhancedDescend?: number;
  grade?: number;
  // Grade Adjusted Pace (GAP)，坡度配速（单位：秒/米）
  gap?: number;
  aePace?: number;
  aePower?: number;
  /** 模型估算功率；与设备事实字段 power 永久分轨。 */
  calculatedPower?: number;
  vo2?: number;
}

export interface SensorLength extends ActivityLengthType {
  activityId: number;
}

export interface ActivityParquetInfo {
  activityId: number;
  parquetPath: string;
  pointCount: number;
}

export type ActivityMidpointTrackRecordResult =
  | {
      status: 'available';
      recordedAt: Date;
      latitude: number;
      longitude: number;
      trackStartAt: Date;
      trackEndAt: Date;
      deltaMs: number;
    }
  | {
      status: 'unavailable';
      reason:
        | 'MISSING_TRACK_TIME'
        | 'MISSING_MIDPOINT_LOCATION'
        | 'INVALID_MIDPOINT_LOCATION';
    };

/** DuckDB `getRows()` 返回的列数组。 */
type DuckDBResultRow = unknown[];
/** DESCRIBE / 查询结果可能是数组或带 column_name 的对象。 */
type DuckDBDescribeRow = DuckDBResultRow | { column_name?: unknown };

function duckField(row: unknown, key: string): unknown {
  if (row && typeof row === 'object' && key in row) {
    return (row as Record<string, unknown>)[key];
  }
  return undefined;
}
type DuckDBQueryParam = string | number | Date | null;
type DuckDBNormalizedRow = Record<string, unknown>;
type ParquetCell = string | number | Date | bigint | null;
type ParquetNormalizedRow = Record<string, ParquetCell>;

/**
 * 已上传、但尚未挂到 Activity 上的 Parquet 文件。
 *
 * 导入链路先生成这份 staging descriptor，随后再和 canonical primary、
 * Activity 摘要及 laps 一起在数据库事务中提交。上传后的对象使用唯一 key，
 * 因此提交前不会影响现有活动读取。
 */
export interface StagedActivityParquetFile extends ActivityParquetInfo {
  type: 'record' | 'length';
  fileSize: number;
  storageStrategy: $Enums.StorageStrategy;
  checksum: string;
}

type RetiredParquetFile = Pick<
  StagedActivityParquetFile,
  'activityId' | 'parquetPath'
>;

const PARQUET_GARBAGE_GRACE_MS = 60 * 60 * 1000;

export interface SensorDataQuery {
  activityIds?: number[];
  startTime?: Date;
  endTime?: Date;
  metrics?: string[];
  groupBy?: string;
  limit?: number;
}

@Injectable()
export class SensorDataService implements OnModuleDestroy {
  private duckDB: DuckDBInstance | undefined;
  private connection: DuckDBConnection | undefined;
  private duckDBInitialization: Promise<void> | undefined;
  private duckDBTimestampValue:
    | (typeof import('@duckdb/node-api'))['DuckDBTimestampValue']
    | undefined;
  private readonly logger = new Logger(SensorDataService.name);
  private readonly localParquetFilePromises = new Map<
    string,
    Promise<string>
  >();

  constructor(
    @Inject(STORAGE_PORT) private storageService: StoragePort,
    private prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sensorFiles: SensorFileQueryService,
  ) {}

  /**
   * 初始化 DuckDB
   */
  private async initializeDuckDB() {
    // DuckDB 只作为本进程内的查询引擎，实际数据仍落在 parquet 文件里。
    try {
      // Keep the native binding lazy so processes without Parquet work can start without it.
      const { DuckDBInstance, DuckDBTimestampValue } = await loadDuckDBModule();
      this.duckDB = await DuckDBInstance.create(':memory:', {
        // threads:'2'
      });
      this.connection = await this.duckDB.connect();
      this.duckDBTimestampValue = DuckDBTimestampValue;
      this.logger.log('DuckDB 连接成功');
    } catch (error) {
      this.logger.error(
        `DuckDB 连接失败：${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * ensure DuckDB init
   */
  private async ensureDuckDBInitialized() {
    if (this.connection) return;
    this.duckDBInitialization ??= this.initializeDuckDB().finally(() => {
      if (!this.connection) this.duckDBInitialization = undefined;
    });
    await this.duckDBInitialization;
    if (!this.connection || !this.duckDB) {
      throw new Error('DuckDB connection not initialized');
    }
  }

  /**
   * set sensor records to parquet file
   * @param activityEntity Activity
   * @param records SensorRecord[]
   * @returns ActivityParquetInfo
   */
  async storeSensorData(
    activityEntity: Activity,
    records: SensorRecord[],
  ): Promise<ActivityParquetInfo> {
    const staged = await this.stageSensorData(activityEntity, records);
    await this.persistStagedParquetFile(staged);
    return staged;
  }

  /** 上传 record Parquet，但不更新 ActivityParquetFile 指针。 */
  async stageSensorData(
    activityEntity: Activity,
    records: SensorRecord[],
  ): Promise<StagedActivityParquetFile> {
    // 传感器 record 统一转 parquet，再通过 StorageService 存储。数据库指针
    // 由调用方决定何时提交，以支持 canonical 数据集的两阶段切换。
    if (records.length === 0) {
      throw new Error('No records to store');
    }

    // 添加系统序列号和 hashId
    const parquetData = records.map((record) => ({
      ...record,
      activityId: activityEntity.id,
      hashId: activityEntity.hashId,
    }));
    const parquetBuffer = await this.convertRecordToParquet(parquetData);
    this.logger.log(
      `[storeSensorData] 读取到 records 长度： ${records.length}  ${activityEntity.id} (${activityEntity.hashId})，文件大小: ${parquetBuffer.length} bytes`,
    );

    // calculate file checksum
    const checksum = crypto
      .createHash('md5')
      .update(parquetBuffer)
      .digest('hex');

    // store to storage service - 使用 StorageService
    const parquetFile = {
      buffer: parquetBuffer,
      originalname: `activity_${activityEntity.id}_records.parquet`,
      mimetype: 'application/octet-stream',
      size: parquetBuffer.length,
    } as Express.Multer.File;
    // 上传文件到存储服务
    this.logger.log(
      `[storeSensorData] 开始上传活动文件 ${activityEntity.id} (${activityEntity.hashId})，file name: ${parquetFile.originalname}`,
    );
    const uploadResult = await this.storageService.uploadFile(parquetFile);
    const parquetPath = uploadResult.fileKey;
    // 数据库元数据必须与 StorageService 的 LOCAL 默认值一致。
    const storageStrategy =
      this.configService.get('STORAGE_STRATEGY') ||
      $Enums.StorageStrategy.LOCAL;
    this.logger.log(`[storeSensorData] 文件上传完毕, ${parquetPath}`);

    return {
      activityId: activityEntity.id,
      parquetPath,
      pointCount: records.length,
      type: 'record',
      fileSize: parquetBuffer.length,
      storageStrategy,
      checksum,
    };
  }

  /**
   * store sensor length data to parquet file
   */
  async storeSensorLength(
    activityEntity: Activity,
    lengths: SensorLength[],
  ): Promise<ActivityParquetInfo> {
    const staged = await this.stageSensorLength(activityEntity, lengths);
    await this.persistStagedParquetFile(staged);
    return staged;
  }

  /** 上传 length Parquet，但不更新 ActivityParquetFile 指针。 */
  async stageSensorLength(
    activityEntity: Activity,
    lengths: SensorLength[],
  ): Promise<StagedActivityParquetFile> {
    // 游泳 lengthMesg 单独落 parquet，避免和逐秒 record 混在同一 schema 里。
    if (lengths.length === 0) {
      throw new Error('No records to store');
    }
    this.logger.log(
      `[storeSensorLength] 开始处理长度数据：活动ID=${activityEntity.id} (${activityEntity.hashId})，记录数=${lengths.length}`,
    );

    // add activityId and hashId to sensor lengths
    const parquetData = lengths?.map((length) => ({
      activityId: activityEntity.id,
      hashId: activityEntity.hashId,
      ...length,
    }));
    const parquetBuffer = await this.convertLengthToParquet(parquetData);
    this.logger.log(
      `[storeSensorLength] 长度数据转换为 Parquet 完成：活动ID=${activityEntity.id} (${activityEntity.hashId})，文件大小=${parquetBuffer.length} 字节`,
    );

    // calculate file checksum
    const checksum = crypto
      .createHash('md5')
      .update(parquetBuffer)
      .digest('hex');

    // store to storage service - 使用 StorageService
    const parquetFile = {
      buffer: parquetBuffer,
      originalname: `activity_${activityEntity.id}_lengths.parquet`,
      mimetype: 'application/octet-stream',
      size: parquetBuffer.length,
    } as Express.Multer.File;
    // upload parquet file to storage service
    this.logger.log(
      `[storeSensorLength] 开始上传 Parquet 文件：活动ID=${activityEntity.id} (${activityEntity.hashId})，文件名=${parquetFile.originalname}`,
    );
    const uploadResult = await this.storageService.uploadFile(parquetFile);
    const parquetPath = uploadResult.fileKey;
    // 数据库元数据必须与 StorageService 的 LOCAL 默认值一致。
    const storageStrategy =
      this.configService.get('STORAGE_STRATEGY') ||
      $Enums.StorageStrategy.LOCAL;
    this.logger.log(`[storeSensorLength] Parquet 文件存储完成：${parquetPath}`);

    return {
      activityId: activityEntity.id,
      parquetPath,
      pointCount: lengths.length,
      type: 'length',
      fileSize: parquetBuffer.length,
      storageStrategy,
      checksum,
    };
  }

  private async persistStagedParquetFile(
    file: StagedActivityParquetFile,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const previous = (await this.sensorFiles.parquetFiles(tx).findUnique({
        where: {
          activityId_type: {
            activityId: file.activityId,
            type: file.type,
          },
        },
        select: { parquetPath: true },
      })) as { parquetPath: string } | null;
      await this.sensorFiles.parquetFiles(tx).upsert({
        where: {
          activityId_type: {
            activityId: file.activityId,
            type: file.type,
          },
        },
        update: {
          parquetPath: file.parquetPath,
          fileSize: file.fileSize,
          pointCount: file.pointCount,
          storageStrategy: file.storageStrategy,
          checksum: file.checksum,
        },
        create: {
          activityId: file.activityId,
          parquetPath: file.parquetPath,
          fileSize: file.fileSize,
          pointCount: file.pointCount,
          type: file.type,
          storageStrategy: file.storageStrategy,
          checksum: file.checksum,
        },
      });
      if (previous?.parquetPath && previous.parquetPath !== file.parquetPath) {
        await this.enqueueParquetGarbage(
          [
            {
              activityId: file.activityId,
              parquetPath: previous.parquetPath,
            },
          ],
          'manifest_replaced',
          PARQUET_GARBAGE_GRACE_MS,
          tx,
        );
      }
    });
  }

  async enqueueParquetGarbage(
    files: readonly RetiredParquetFile[],
    reason: string,
    delayMs = PARQUET_GARBAGE_GRACE_MS,
    client: Pick<PrismaService, 'storageObjectGarbage'> = this.prisma,
  ): Promise<void> {
    const availableAt = new Date(Date.now() + Math.max(0, delayMs));
    const unique = Array.from(
      new Map(
        files
          .filter((file) => String(file.parquetPath ?? '').trim())
          .map((file) => [file.parquetPath, file]),
      ).values(),
    );
    await Promise.all(
      unique.map((file) =>
        this.sensorFiles.garbage(client).upsert({
          where: {
            bucket_objectKey: {
              bucket: 'default',
              objectKey: file.parquetPath,
            },
          },
          create: {
            activityId: file.activityId,
            objectKey: file.parquetPath,
            bucket: 'default',
            reason,
            availableAt,
          },
          update: {
            activityId: file.activityId,
            reason,
            availableAt,
            lockedAt: null,
            lastError: null,
          },
        }),
      ),
    );
  }

  /**
   * 按时间维度聚合数据
   * 使用 DuckDB 直接从 Parquet 文件查询
   */
  async aggregateByTime(
    activityIds: number[],
    metric: string,
    timeGranularity: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month',
  ): Promise<any[]> {
    if (activityIds.length === 0) {
      return [];
    }

    try {
      this.logger.log('[传感器数据] 开始按时间聚合');
      this.logger.debug({
        activityIds,
        metric,
        timeGranularity,
      });
      const timeFormat = this.getTimeFormat(timeGranularity);
      const tsExpr = `try_cast(timestamp AS TIMESTAMP)`;
      const column = this.mapMetricToColumn(metric);

      // 从数据库获取存储键，并确保本地可读路径
      const infos = await this.getActivitiesParquetInfo(activityIds, 'record');
      if (infos.length === 0) return [];
      const localPaths = await this.ensureLocalParquetFiles(
        infos.map((i) => i.parquetPath),
      );
      const parquetFiles = localPaths.map((p) => `'${p.replace(/'/g, "''")}'`);
      this.logger.debug({ parquetFiles });

      // 读取基础行数与时间范围做诊断
      try {
        const _diag = await this.executeQuery(
          `SELECT COUNT(*) AS cnt, MIN(${tsExpr}) AS min_ts, MAX(${tsExpr}) AS max_ts FROM read_parquet([${parquetFiles.join(
            ', ',
          )}], union_by_name=true)`,
        );
        // this.logger.debug({
        //   msg: '[SensorDataService] diag total/min/max',
        //   ...diag?.[0],
        // });
        const _diagMetric = await this.executeQuery(
          `SELECT COUNT(${column}) AS non_null_metric, COUNT(${tsExpr}) AS non_null_ts FROM read_parquet([${parquetFiles.join(
            ', ',
          )}], union_by_name=true) WHERE ${column} IS NOT NULL`,
        );
        // this.logger.debug({
        //   msg: '[SensorDataService] diag non_null_metric',
        //   ...diagMetric?.[0],
        // });

        // 预览原始行（等价于 Select *），查看时间与指标原始值
        const _preview = await this.executeQuery(
          `SELECT *, ${tsExpr} AS ts FROM read_parquet([${parquetFiles.join(
            ', ',
          )}], union_by_name=true) ORDER BY timestamp LIMIT 5`,
        );
        // this.logger.debug({
        //   msg: '[SensorDataService] preview * top5',
        //   rows: preview,
        // });
        const _previewMetric = await this.executeQuery(
          `SELECT timestamp, ${tsExpr} AS ts, ${column} AS m FROM read_parquet([${parquetFiles.join(
            ', ',
          )}], union_by_name=true) WHERE ${column} IS NOT NULL ORDER BY timestamp LIMIT 5`,
        );
        // this.logger.debug({
        //   msg: '[SensorDataService] preview metric top5',
        //   rows: previewMetric,
        // });
      } catch (e) {
        this.logger.error(
          `[传感器数据] 诊断查询失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }

      const sql = `
        SELECT 
          strftime(${tsExpr}, '${timeFormat}') as time_period,
          AVG(${column}) as avg_value,
          SUM(${column}) as sum_value,
          MAX(${column}) as max_value,
          MIN(${column}) as min_value,
          COUNT(*) as point_count
        FROM read_parquet([${parquetFiles.join(', ')}], union_by_name=true)
        WHERE ${column} IS NOT NULL AND ${tsExpr} IS NOT NULL
        GROUP BY time_period
        ORDER BY time_period
      `;

      const rows = await this.executeQuery(sql, []);
      const columns = [
        'time_period',
        'avg_value',
        'sum_value',
        'max_value',
        'min_value',
        'point_count',
      ];
      return this.normalizeRows(rows, columns);
    } catch (error) {
      this.logger.error(
        `[aggregateByTime] 按时间聚合失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * 按距离维度聚合数据
   * 使用 DuckDB 直接从 Parquet 文件查询
   */
  async aggregateByDistance(
    activityIds: number[],
    metric: string,
    distanceBins: number[],
  ): Promise<any[]> {
    if (activityIds.length === 0) {
      return [];
    }

    try {
      // 从数据库获取存储键，并确保本地可读路径
      const infos = await this.getActivitiesParquetInfo(activityIds, 'record');
      if (infos.length === 0) return [];
      const localPaths = await this.ensureLocalParquetFiles(
        infos.map((i) => i.parquetPath),
      );
      const parquetFiles = localPaths.map((p) => `'${p.replace(/'/g, "''")}'`);

      const column = this.mapMetricToColumn(metric);
      let sql: string;
      if (distanceBins && distanceBins.length > 0) {
        const binConditions = distanceBins
          .map((bin, index) => {
            const nextBin = distanceBins[index + 1];
            if (nextBin) {
              return `WHEN distance >= ${bin} AND distance < ${nextBin} THEN '${bin}-${nextBin}'`;
            } else {
              return `WHEN distance >= ${bin} THEN '${bin}+'`;
            }
          })
          .join(' ');
        sql = `
          SELECT 
            CASE ${binConditions} END as distance_bin,
            AVG(${column}) as avg_value,
            MAX(${column}) as max_value,
            MIN(${column}) as min_value,
            COUNT(*) as point_count
          FROM read_parquet([${parquetFiles.join(', ')}], union_by_name=true)
          WHERE ${column} IS NOT NULL AND distance IS NOT NULL
          GROUP BY distance_bin
          ORDER BY distance_bin
        `;
      } else {
        // 默认按 100 米分箱（可调），distance 单位为米
        const bucket = 100;
        sql = `
          SELECT 
            CAST(FLOOR(distance / ${bucket}) * ${bucket} AS INTEGER) AS distance_bin,
            AVG(${column}) as avg_value,
            MAX(${column}) as max_value,
            MIN(${column}) as min_value,
            COUNT(*) as point_count
          FROM read_parquet([${parquetFiles.join(', ')}], union_by_name=true)
          WHERE ${column} IS NOT NULL AND distance IS NOT NULL
          GROUP BY distance_bin
          ORDER BY distance_bin
        `;
      }

      const rows = await this.executeQuery(sql, []);
      const columns = [
        'distance_bin',
        'avg_value',
        'max_value',
        'min_value',
        'point_count',
      ];
      return this.normalizeRows(rows, columns);
    } catch (error) {
      this.logger.error(
        `按距离聚合数据失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 删除活动的传感器数据
   */
  async deleteSensorData(activityId: number): Promise<void> {
    const found = await this.prisma.$transaction(async (tx) => {
      const parquetFiles = (await this.sensorFiles.parquetFiles(tx).findMany({
        where: { activityId },
        select: { activityId: true, parquetPath: true },
      })) as Array<{ activityId: number; parquetPath: string }>;
      await this.enqueueParquetGarbage(
        parquetFiles,
        'activity_sensor_data_deleted',
        PARQUET_GARBAGE_GRACE_MS,
        tx,
      );
      await this.sensorFiles
        .parquetFiles(tx)
        .deleteMany({ where: { activityId } });
      return parquetFiles.length > 0;
    });
    if (!found) {
      await this.enqueueParquetGarbage(
        [{ activityId, parquetPath: this.getParquetKey(activityId) }],
        'legacy_inferred_path',
      );
    }
  }

  /**
   * 获取活动的 Parquet 文件信息
   */
  async getActivityParquetInfo(
    activityId: number,
    type: 'record' | 'length' = 'record',
  ): Promise<ActivityParquetInfo | null> {
    // 直接读取数据库记录
    const parquetInfo = (await this.sensorFiles.parquetFiles().findFirst({
      where: { activityId, type },
    })) as { parquetPath: string; pointCount: number } | null;
    if (!parquetInfo) return null;

    return {
      activityId,
      parquetPath: parquetInfo.parquetPath,
      pointCount: parquetInfo.pointCount,
    };
  }

  /**
   * 批量获取多个活动的 Parquet 文件信息
   */
  async getActivitiesParquetInfo(
    activityIds: number[],
    type: 'record' | 'length' = 'record',
  ): Promise<ActivityParquetInfo[]> {
    if (activityIds.length === 0) {
      return [];
    }

    const parquetFiles = (await this.sensorFiles.parquetFiles().findMany({
      where: {
        activityId: { in: [...new Set(activityIds)] },
        type,
      },
      select: {
        activityId: true,
        parquetPath: true,
        pointCount: true,
      },
    })) as Array<{
      activityId: number;
      parquetPath: string;
      pointCount: number;
    }>;
    const filesByActivityId = new Map(
      parquetFiles.map((file) => [file.activityId, file]),
    );

    return activityIds.flatMap((activityId) => {
      const file = filesByActivityId.get(activityId);
      return file
        ? [
            {
              activityId,
              parquetPath: file.parquetPath,
              pointCount: file.pointCount,
            },
          ]
        : [];
    });
  }

  /**
   * 读取真实时间轴中点附近的一条 GPS 记录。
   * 只查询 timestamp/positionLat/positionLong，不把完整轨迹载入 Node.js。
   */
  async getActivityMidpointTrackRecord(
    activityId: number,
  ): Promise<ActivityMidpointTrackRecordResult> {
    await this.ensureDuckDBInitialized();
    const info = await this.getActivityParquetInfo(activityId, 'record');
    if (!info) return { status: 'unavailable', reason: 'MISSING_TRACK_TIME' };

    try {
      const [localPath] = await this.ensureLocalParquetFiles([
        info.parquetPath,
      ]);
      if (!localPath)
        return { status: 'unavailable', reason: 'MISSING_TRACK_TIME' };
      const parquetPath = `'${localPath.replace(/'/g, "''")}'`;
      const boundsRows = await this.executeQuery(`
        SELECT
          epoch_ms(MIN(try_cast(timestamp AS TIMESTAMP))) AS start_ms,
          epoch_ms(MAX(try_cast(timestamp AS TIMESTAMP))) AS end_ms
        FROM read_parquet(${parquetPath}, union_by_name=true)
        WHERE try_cast(timestamp AS TIMESTAMP) IS NOT NULL
      `);
      const startMs = Number(boundsRows[0]?.[0]);
      const endMs = Number(boundsRows[0]?.[1]);
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        endMs <= startMs
      ) {
        return { status: 'unavailable', reason: 'MISSING_TRACK_TIME' };
      }

      const midpointMs = startMs + (endMs - startMs) / 2;
      const roundedMidpointMs = Math.round(midpointMs);
      const pointRows = await this.executeQuery(`
          SELECT
            epoch_ms(try_cast(timestamp AS TIMESTAMP)) AS recorded_ms,
            try_cast(positionLat AS DOUBLE) AS latitude,
            try_cast(positionLong AS DOUBLE) AS longitude
          FROM read_parquet(${parquetPath}, union_by_name=true)
          WHERE try_cast(timestamp AS TIMESTAMP) IS NOT NULL
            AND try_cast(positionLat AS DOUBLE) IS NOT NULL
            AND try_cast(positionLong AS DOUBLE) IS NOT NULL
          ORDER BY
            ABS(epoch_ms(try_cast(timestamp AS TIMESTAMP)) - ${roundedMidpointMs}) ASC,
            try_cast(timestamp AS TIMESTAMP) ASC
          LIMIT 1
        `);
      if (!pointRows.length) {
        return {
          status: 'unavailable',
          reason: 'MISSING_MIDPOINT_LOCATION',
        };
      }

      const recordedMs = Number(pointRows[0]?.[0]);
      const latitude = Number(pointRows[0]?.[1]);
      const longitude = Number(pointRows[0]?.[2]);
      if (
        !Number.isFinite(recordedMs) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return {
          status: 'unavailable',
          reason: 'INVALID_MIDPOINT_LOCATION',
        };
      }

      const deltaMs = Math.abs(recordedMs - midpointMs);
      const maxDeltaMs = Math.min(5 * 60_000, (endMs - startMs) * 0.1);
      if (deltaMs > maxDeltaMs) {
        return {
          status: 'unavailable',
          reason: 'MISSING_MIDPOINT_LOCATION',
        };
      }

      return {
        status: 'available',
        recordedAt: new Date(recordedMs),
        latitude,
        longitude,
        trackStartAt: new Date(startMs),
        trackEndAt: new Date(endMs),
        deltaMs,
      };
    } catch {
      this.logger.warn(
        `[activity-midpoint] activity=${activityId} code=MIDPOINT_QUERY_FAILED`,
      );
      return { status: 'unavailable', reason: 'MISSING_TRACK_TIME' };
    }
  }

  /**
   * 检查活动的传感器数据是否存在
   */
  async hasSensorData(activityId: number): Promise<boolean> {
    const record = (await this.sensorFiles.parquetFiles().findFirst({
      where: { activityId, type: 'record' },
    })) as { parquetPath: string } | null;
    if (!record?.parquetPath) return false;
    try {
      await this.storageService.getFileWithKey(record.parquetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 从 Parquet 文件中提取坐标数据用于地图图层
   * @param activityIds 活动ID列表
   * @param samplingPercentage 采样百分比 (1-100)
   * @returns 包含编码后 polyline 的地图数据
   */
  async getActivitiesLocationData(
    activityIds: number[],
    samplingPercentage: number = 100,
  ): Promise<
    {
      hashId: string;
      polyline: string;
    }[]
  > {
    // 多活动地图图层直接从 parquet 读取 GPS 点，按采样率生成压缩 polyline。
    if (activityIds.length === 0) {
      return [];
    }

    await this.ensureDuckDBInitialized();

    // 获取活动的 Parquet 文件信息
    this.logger.log(`获取 ${activityIds.length} 个活动的 Parquet 文件信息`);
    const infos = await this.getActivitiesParquetInfo(activityIds, 'record');
    this.logger.log(`获取到 ${infos.length} 个活动的 Parquet 文件信息`);
    if (infos.length === 0) {
      return [];
    }
    const localPaths = await this.ensureLocalParquetFiles(
      infos.map((i) => i.parquetPath),
    );
    const parquetFiles = localPaths.map((p) => `'${p.replace(/'/g, "''")}'`);

    // 计算采样间隔
    const samplingInterval = Math.max(1, Math.floor(100 / samplingPercentage));

    try {
      // 查询坐标数据，按活动分组并进行采样
      const sql = `
        WITH sampled_data AS (
          SELECT 
            activityId,
            hashId,
            CAST(COALESCE(lapIndex, 0) AS BIGINT) AS routeSegmentIndex,
            positionLat,
            positionLong,
            distance,
            ROW_NUMBER() OVER (
              PARTITION BY activityId, CAST(COALESCE(lapIndex, 0) AS BIGINT)
              ORDER BY timestamp
            ) as row_num
          FROM read_parquet([${parquetFiles.join(', ')}], union_by_name=true)
          WHERE positionLat IS NOT NULL AND positionLong IS NOT NULL
        )
        SELECT 
          activityId,
          hashId,
          routeSegmentIndex,
          positionLat,
          positionLong,
          distance,
        FROM sampled_data
        ${samplingInterval != 1 ? `WHERE row_num % ${samplingInterval} = 1` : ''}
        ORDER BY activityId, routeSegmentIndex, row_num
      `;
      const rows = await this.executeQuery(sql);
      // this.logger.debug({
      //   msg: 'getActivitiesLocationData rows count',
      //   count: rows.length,
      // });
      // 按活动分组处理坐标数据
      const activityGroups = new Map<
        string,
        { hashId: string; coordinates: Array<[number, number]> }
      >();
      for (const row of rows) {
        const hashId = String(row[1]);
        const routeSegmentIndex = Number(row[2]);
        const positionLat = Number(row[3]);
        const positionLong = Number(row[4]);
        const groupKey = `${hashId}:${Number.isFinite(routeSegmentIndex) ? routeSegmentIndex : 0}`;

        if (!activityGroups.has(groupKey)) {
          activityGroups.set(groupKey, { hashId, coordinates: [] });
        }

        // polyline 编码需要 [positionLat, positionLong] 格式
        activityGroups
          .get(groupKey)!
          .coordinates.push([positionLat, positionLong]);
      }
      // 使用 @mapbox/polyline 编码坐标数据
      const polyline = await import('@mapbox/polyline');
      const maps = Array.from(activityGroups.values())
        .filter((group) => group.coordinates.length > 1)
        .map((group) => ({
          hashId: group.hashId,
          polyline: polyline.encode(group.coordinates),
        }));

      return maps;
    } catch (error) {
      this.logger.error(
        `[getActivitiesLocationData] 获取活动轨迹失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * 根据活动 ID 获取 lengths 数据
   */
  async getSensorLengthByActivityId(activityId: number): Promise<Array<{
    timestamp: string;
    index: number | null;
    event: string | null;
    totalElapsedTime: number | null;
    totalStrokes: number | null;
    avgSpeed: number | null;
    swimStroke: string | null;
    avgSwimmingCadence: number | null;
    strokeCount: number | null;
    messageIndex: number | null;
    startTime: string | null;
  }> | null> {
    const info = await this.getActivityParquetInfo(activityId, 'length');
    if (!info) {
      this.logger.warn(
        `[getSensorLengthByActivityId] 活动 ${activityId} 未找到 Parquet 信息`,
      );
      return null;
    }
    try {
      // 确保本地文件存在
      const [localPath] = await this.ensureLocalParquetFiles([
        info.parquetPath,
      ]);
      const sql = `
        SELECT 
          COALESCE(strftime('%Y-%m-%d %H:%M:%S', try_cast(timestamp AS TIMESTAMP)), '') AS timestamp,
          index,
          event,
          totalElapsedTime,
          totalStrokes,
          avgSpeed,
          swimStroke,
          avgSwimmingCadence,
          messageIndex,
          strokeCount,
          COALESCE(strftime('%Y-%m-%d %H:%M:%S', try_cast(startTime AS TIMESTAMP)), '') AS startTime,
        FROM read_parquet('${localPath.replace(/'/g, "''")}', union_by_name=true)
        ORDER BY messageIndex, startTime
      `;
      const rows = await this.executeQuery(sql);
      const columns = [
        'timestamp',
        'index',
        'event',
        'totalElapsedTime',
        'totalStrokes',
        'avgSpeed',
        'swimStroke',
        'avgSwimmingCadence',
        'messageIndex',
        'strokeCount',
        'startTime',
      ];
      const normalized = this.normalizeRows(rows, columns) as Array<{
        timestamp: string;
        index: number | null;
        event: string | null;
        totalElapsedTime: number | null;
        totalStrokes: number | null;
        avgSpeed: number | null;
        swimStroke: string | null;
        avgSwimmingCadence: number | null;
        strokeCount: number | null;
        startTime: string | null;
        messageIndex: number | null;
      }>;
      return normalized;
    } catch (error) {
      this.logger.error(
        `[getSensorLengthByActivityId] 获取长度序列失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * 返回游泳 lengthMesg 生成的按长度累积的时间/距离序列
   * 每行包含结束时间 time（ISO 字符串）与累计 distance（字符串，单位米）
   */
  async getLengthSeriesAsDistance(
    activityId: number,
  ): Promise<Array<{ time: string; distance: string }>> {
    // 游泳图表没有连续 GPS 距离时，用每段 length 的时间/速度累积出距离轴。
    const info = await this.getActivityParquetInfo(activityId, 'length');
    if (!info) {
      this.logger.warn(
        `[getLengthSeriesAsDistance] 活动 ${activityId} 未找到 length Parquet 信息`,
      );
      return [];
    }
    try {
      const [localPath] = await this.ensureLocalParquetFiles([
        info.parquetPath,
      ]);
      const sql = `
        SELECT 
          try_cast(startTime AS TIMESTAMP) AS startTime,
          totalElapsedTime,
          avgSpeed,
          messageIndex
        FROM read_parquet('${localPath.replace(/'/g, "''")}', union_by_name=true)
        WHERE startTime IS NOT NULL AND totalElapsedTime IS NOT NULL
        ORDER BY messageIndex, startTime
      `;
      const rows = await this.executeQuery(sql);
      // 将每个 length 的结束时间与累计距离计算出来
      let cumulativeDistance = 0;
      const result: Array<{ time: string; distance: string }> = [];
      for (const r of rows || []) {
        const startTimeStr = r?.[0] ?? duckField(r, 'startTime');
        const elapsedS = r?.[1] ?? duckField(r, 'totalElapsedTime');
        const avgSpeed = r?.[2] ?? duckField(r, 'avgSpeed');
        if (startTimeStr == null || elapsedS == null) continue;
        const startMs = new Date(String(startTimeStr)).getTime();
        if (!isFinite(startMs)) continue;
        const dist =
          avgSpeed != null &&
          isFinite(Number(avgSpeed)) &&
          isFinite(Number(elapsedS))
            ? Number(avgSpeed) * Number(elapsedS)
            : 0;
        if (dist <= 0) continue;

        cumulativeDistance += dist;
        const endMs = startMs + Number(elapsedS) * 1000;
        result.push({
          time: new Date(endMs).toISOString(),
          distance: String(cumulativeDistance),
        });
      }
      return result;
    } catch (error) {
      this.logger.error(
        `[getLengthSeriesAsDistance] 生成距离序列失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * 返回单活动的原始记录序列（多指标）
   * 结果每行包含 time、distance 以及各 metric 的列
   */
  /** Bounded unrounded samples for deterministic assessments. Missing rows are retained. */
  async getFitnessRecordSeries(
    activityId: number,
    maxSamples = 100_000,
  ): Promise<
    Array<{
      epochSeconds: number;
      heartRate: number | null;
      power: number | null;
    }>
  > {
    const info = await this.getActivityParquetInfo(activityId, 'record');
    if (!info) return [];
    const [path] = await this.ensureLocalParquetFiles([info.parquetPath]);
    const columns = await this.getParquetColumns(path);
    const expr = (metric: string) => {
      const col = this.mapMetricToColumn(metric);
      return columns.has(col)
        ? `try_cast(${this.quoteIdentifier(col)} AS DOUBLE)`
        : 'NULL';
    };
    const rows = await this
      .executeQuery(`SELECT epoch_ms(try_cast(timestamp AS TIMESTAMP))/1000.0 AS epochSeconds,
      ${expr('heartRate')} AS heartRate, ${expr('power')} AS power
      FROM read_parquet('${path.replace(/'/g, "''")}') ORDER BY timestamp LIMIT ${Math.min(100_000, Math.max(1, Math.floor(maxSamples))) + 1}`);
    if (rows.length > maxSamples) throw new Error('FITNESS_RESOURCE_LIMIT');
    return this.normalizeRows(rows, ['epochSeconds', 'heartRate', 'power']).map(
      (r) => ({
        epochSeconds: Number(r.epochSeconds),
        heartRate: r.heartRate == null ? null : Number(r.heartRate),
        power: r.power == null ? null : Number(r.power),
      }),
    );
  }

  async getRecordSeriesMulti(
    activityId: number,
    metrics: string[],
    timezone?: string | null,
    maxRows?: number,
  ): Promise<
    Array<{ time: string; distance: string } & Record<string, number>>
  > {
    this.logger.log(
      `[getRecordSeriesMulti] 开始查询活动 ${activityId} 的指标: ${metrics.join(', ')}`,
    );

    const info = await this.getActivityParquetInfo(activityId, 'record');
    if (!info) {
      this.logger.warn(
        `[getRecordSeriesMulti] 活动 ${activityId} 未找到 Parquet 信息`,
      );
      return [];
    }

    // this.logger.debug(
    //   `[getRecordSeriesMulti] 活动 ${activityId} Parquet 路径: ${info.parquetPath}`,
    // );

    const [localPath] = await this.ensureLocalParquetFiles([info.parquetPath]);
    // this.logger.debug(`[getRecordSeriesMulti] 本地文件路径: ${localPath}`);

    const availableColumns = await this.getParquetColumns(localPath);

    // Filter out 'time' and 'distance' as they are always included in the query
    const queryMetrics = metrics.filter(
      (m) => m !== 'time' && m !== 'distance',
    );

    // 构建 SQL 查询
    let sql = this.buildRecordSeriesSQL(
      localPath,
      queryMetrics,
      timezone,
      availableColumns,
    );
    if (maxRows !== undefined) {
      if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 120001) {
        throw new Error('Invalid sensor series row limit');
      }
      sql = `${sql.trim().replace(/;$/, '')} LIMIT ${maxRows}`;
    }
    // this.logger.debug(`[getRecordSeriesMulti] 执行 SQL: ${sql}`);

    try {
      const rows = await this.executeQuery(sql, []);

      const columns = ['time', 'distance', ...queryMetrics];
      const normalized = this.normalizeRows(rows, columns) as Array<
        { time: string; distance: string } & Record<string, number>
      >;

      // 保留两位小数
      const rounded = normalized.map((r) => {
        const out = {
          time: r.time,
          distance: r.distance,
        } as { time: string; distance: string } & Record<
          string,
          number | undefined
        >;
        for (const m of metrics) {
          const v = r[m];
          out[m] =
            v == null || Number.isNaN(Number(v))
              ? undefined
              : Number(Number(v).toFixed(2));
        }
        return out as { time: string; distance: string } & Record<
          string,
          number
        >;
      });

      this.logger.log(
        `[getRecordSeriesMulti] 数据处理完成，返回 ${rounded.length} 行结果`,
      );
      return rounded;
    } catch (error) {
      this.logger.error(
        `[getRecordSeriesMulti] 获取多指标序列失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * 构建记录序列查询 SQL
   */
  private buildRecordSeriesSQL(
    localPath: string,
    metrics: string[],
    timezone?: string | null,
    availableColumns?: ReadonlySet<string>,
  ): string {
    const tsExpr = 'try_cast("timestamp" AS TIMESTAMP)';
    const mapped = metrics.map((m) => this.mapMetricToColumn(m));

    // this.logger.debug(
    //   `[buildRecordSeriesSQL] 指标映射: ${JSON.stringify(
    //     metrics.map((m, i) => ({ original: m, mapped: mapped[i] })),
    //   )}`,
    // );

    let timeExpr = `COALESCE(strftime(${tsExpr}, '%Y-%m-%d %H:%M:%S'), '')`;
    if (timezone) {
      const safeTimezone = timezone.replace(/'/g, "''");
      // Use DuckDB timezone function to convert UTC timestamp to target timezone
      timeExpr = `COALESCE(strftime(timezone('${safeTimezone}', ${tsExpr}), '%Y-%m-%d %H:%M:%S'), '')`;
    }

    const metricExpressions = mapped.map((col, idx) => {
      const safeColumn = this.quoteIdentifier(col);
      const safeAlias = this.quoteIdentifier(metrics[idx]);
      return !availableColumns || availableColumns.has(col)
        ? `${safeColumn} AS ${safeAlias}`
        : `NULL AS ${safeAlias}`;
    });
    const selectParts = [
      `${timeExpr} AS time`,
      !availableColumns || availableColumns.has('distance')
        ? `COALESCE(CAST(distance AS VARCHAR), '') AS distance`
        : `'' AS distance`,
      ...metricExpressions,
    ];

    const whereParts = mapped
      .filter((col) => availableColumns?.has(col) ?? true)
      .map((col) => `${this.quoteIdentifier(col)} IS NOT NULL`);
    const whereClause =
      whereParts.length > 0 ? `WHERE ${whereParts.join(' OR ')}` : '';

    return `
      SELECT 
        ${selectParts.join(',\n        ')}
      FROM read_parquet('${localPath.replace(/'/g, "''")}', union_by_name=true)
      ${whereClause}
      ORDER BY ${tsExpr}
    `;
  }

  private quoteIdentifier(value: string): string {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
      throw new Error(`Unsupported sensor metric: ${value}`);
    }
    return `"${value}"`;
  }

  private async getParquetColumns(localPath: string): Promise<Set<string>> {
    const escapedPath = localPath.replace(/'/g, "''");
    const rows = await this.executeQuery(
      `DESCRIBE SELECT * FROM read_parquet('${escapedPath}', union_by_name=true)`,
    );
    return new Set(
      (rows ?? [])
        .map((row: DuckDBDescribeRow) =>
          Array.isArray(row) ? row[0] : row.column_name,
        )
        .filter((value: unknown): value is string => typeof value === 'string'),
    );
  }

  /**
   * 按时间粒度聚合（多指标）
   */
  async aggregateByTimeMulti(
    activityIds: number[],
    metrics: string[],
    timeGranularity: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month',
    agg: 'avg' | 'sum' | 'max' | 'min' | 'count' = 'avg',
  ): Promise<Array<{ time_period: string } & Record<string, number>>> {
    try {
      if (activityIds.length === 0 || metrics.length === 0) return [];
      await this.ensureDuckDBInitialized();
      const timeFormat = this.getTimeFormat(timeGranularity);
      const infos = await this.getActivitiesParquetInfo(activityIds, 'record');
      if (infos.length === 0) return [];

      // 确保本地文件存在并获取本地路径
      const parquetPaths = infos.map((info) => info.parquetPath);
      const localPaths = await this.ensureLocalParquetFiles(parquetPaths);
      const parquetFiles = localPaths
        .map((localPath) => `'${localPath}'`)
        .join(', ');
      const aggFn = agg.toUpperCase();
      const mapped = metrics.map((m) => this.mapMetricToColumn(m));
      const selectMetrics = mapped
        .map((col, idx) => `${aggFn}(${col}) AS ${metrics[idx]}`)
        .join(',\n          ');

      const sql = `
      SELECT 
        strftime('${timeFormat}', try_cast(timestamp AS TIMESTAMP)) AS time_period,
        ${selectMetrics}
      FROM read_parquet([${parquetFiles}], union_by_name=true)
      WHERE try_cast(timestamp AS TIMESTAMP) IS NOT NULL
      GROUP BY time_period
      ORDER BY time_period
    `;
      // this.logger.debug(`[aggregateByTimeMulti] 执行 SQL: ${sql}`);
      const rows = await this.executeQuery(sql, []);
      const columns = ['time_period', ...metrics];
      const normalized = this.normalizeRows(rows, columns) as Array<
        { time_period: string } & Record<string, number>
      >;
      // 保留两位小数
      const rounded = normalized.map((r) => {
        const out = { time_period: r.time_period } as {
          time_period: string;
        } & Record<string, number | undefined>;
        for (const m of metrics) {
          const v = r[m];
          out[m] =
            v == null || Number.isNaN(Number(v))
              ? undefined
              : Number(Number(v).toFixed(2));
        }
        return out as { time_period: string } & Record<string, number>;
      });
      return rounded;
    } catch (error) {
      this.logger.error(
        `[aggregateByTimeMulti] 多指标按时间聚合失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * 统计单活动序列的 min/max/avg（SQL 下推）
   */
  async getRecordSeriesStats(
    activityId: number,
    metric: string,
  ): Promise<{
    minValue?: number;
    maxValue?: number;
    avgValue?: number;
    sumValue?: number;
  }> {
    try {
      const info = await this.getActivityParquetInfo(activityId, 'record');
      if (!info) return {};
      const [localPath] = await this.ensureLocalParquetFiles([
        info.parquetPath,
      ]);

      const column = this.mapMetricToColumn(metric);
      const sql = `
      SELECT MIN(${column}),
             MAX(${column}),
             AVG(${column}),
             SUM(${column})
      FROM read_parquet('${localPath.replace(/'/g, "''")}', union_by_name=true)
      WHERE ${column} IS NOT NULL
    `;
      const rows = await this.executeQuery(sql, []);
      const r = rows?.[0] || [];
      const result = {
        minValue: r?.[0] != null ? Number(r?.[0]) : undefined,
        maxValue: r?.[1] != null ? Number(r?.[1]) : undefined,
        avgValue: r?.[2] != null ? Number(r?.[2]) : undefined,
        sumValue: r?.[3] != null ? Number(r?.[3]) : undefined,
      };
      // this.logger.debug({
      //   msg: '[SensorDataService] series stats for metric',
      //   metric,
      //   result,
      // });
      return result;
    } catch (error) {
      this.logger.error(
        `[getRecordSeriesStats] 获取序列统计失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {};
    }
  }

  /**
   * Get average Left/Right Balance for an activity.
   * Handles filtering logic based on sport type (e.g., cycling ignores coasting).
   */
  async getAvgLeftRightBalance(
    activityId: number,
    sportType?: string,
  ): Promise<number | null> {
    // 骑行左右平衡按有功率且有踏频的片段计算，避免滑行段稀释均值。
    try {
      const info = await this.getActivityParquetInfo(activityId, 'record');
      if (!info) return null;
      const [localPath] = await this.ensureLocalParquetFiles([
        info.parquetPath,
      ]);

      const column = 'leftRightBalance';
      let whereClause = `${column} IS NOT NULL`;

      // Apply GoldenCheetah-style filtering for Cycling
      if (sportType === 'CYCLING') {
        // power > 0 AND cadence > 0
        whereClause += ` AND power > 0 AND cadence > 0`;
      }

      const sql = `
        SELECT AVG(${column})
        FROM read_parquet('${localPath.replace(/'/g, "''")}', union_by_name=true)
        WHERE ${whereClause}
      `;

      const rows = await this.executeQuery(sql, []);
      const avg =
        rows?.[0]?.['avg(' + column + ')'] ??
        rows?.[0]?.['AVG(' + column + ')'] ??
        Object.values(rows?.[0] || {})[0];

      return avg != null ? Number(Number(avg).toFixed(2)) : null;
    } catch (error) {
      this.logger.error(
        `[getAvgLeftRightBalance] 计算左右平衡均值失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * 确保将存储中的 parquet 文件拉取到本地临时目录，返回本地路径
   */
  private async ensureLocalParquetFiles(keys: string[]): Promise<string[]> {
    // DuckDB 读取本地路径；远端/本地存储统一先拉到系统临时 parquet-cache。
    const cacheDir = path.join(os.tmpdir(), 'parquet-cache');
    await fsp.mkdir(cacheDir, { recursive: true });

    return await Promise.all(
      keys.map((key) => {
        const pending = this.localParquetFilePromises.get(key);
        if (pending) return pending;

        const download = this.ensureLocalParquetFile(key, cacheDir).finally(
          () => this.localParquetFilePromises.delete(key),
        );
        this.localParquetFilePromises.set(key, download);
        return download;
      }),
    );
  }

  private async ensureLocalParquetFile(
    key: string,
    cacheDir: string,
  ): Promise<string> {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const safeName = path
      .basename(key)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-160);
    const cachePath = path.join(cacheDir, `${keyHash}-${safeName}`);

    if (await this.isValidParquetFile(cachePath)) return cachePath;

    const buffer = await this.storageService.getFileWithKey(key);
    const bufferSize = Buffer.isBuffer(buffer) ? buffer.length : 0;
    if (!this.isValidParquetBuffer(buffer)) {
      throw new Error(
        `Downloaded object is not a valid Parquet file: ${key} (${bufferSize} bytes)`,
      );
    }

    // 不直接写最终路径：writeFile 会先截断文件，并发查询可能在
    // 写入完成前读到 0 字节或半个 Parquet。rename 使缓存只有“无”和
    // “完整文件”两种对外可见状态，也能覆盖历史损坏缓存。
    const stagingPath = `${cachePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fsp.writeFile(stagingPath, buffer, { flag: 'wx' });
      await fsp.rename(stagingPath, cachePath);
    } finally {
      await fsp.unlink(stagingPath).catch(() => undefined);
    }

    return cachePath;
  }

  private async isValidParquetFile(filePath: string): Promise<boolean> {
    let file: Awaited<ReturnType<typeof fsp.open>> | undefined;
    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile() || stat.size < 12) return false;

      file = await fsp.open(filePath, 'r');
      const header = Buffer.allocUnsafe(4);
      const footer = Buffer.allocUnsafe(4);
      await file.read(header, 0, 4, 0);
      await file.read(footer, 0, 4, stat.size - 4);
      return this.hasValidParquetMagic(header, footer);
    } catch {
      return false;
    } finally {
      await file?.close().catch(() => undefined);
    }
  }

  private isValidParquetBuffer(buffer: Buffer | undefined): buffer is Buffer {
    if (!buffer || buffer.length < 12) return false;
    return this.hasValidParquetMagic(
      buffer.subarray(0, 4),
      buffer.subarray(buffer.length - 4),
    );
  }

  private hasValidParquetMagic(header: Buffer, footer: Buffer): boolean {
    return (
      header.equals(Buffer.from('PAR1')) &&
      (footer.equals(Buffer.from('PAR1')) || footer.equals(Buffer.from('PARE')))
    );
  }

  /**
   * 获取Parquet文件路径
   */
  private getParquetKey(activityId: number): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `records/${year}/${month}/activity_${activityId}.parquet`;
  }

  /**
   * 标准化记录数据以适配Parquet格式
   */
  private normalizeRecordsForParquet(
    data: SensorRecord[],
  ): ParquetNormalizedRow[] {
    // Parquet schema 尽量稳定：未知/缺失字段补 null，避免不同设备字段差异导致 union 查询失败。
    // 与临时表字段顺序保持一致，避免字段映射误差
    const tableFields = [
      // 系统字段
      'activityId',
      'hashId',

      // RecordMesgType 核心字段
      'timestamp',
      'positionLat',
      'positionLong',
      'altitude',
      'enhancedAltitude',
      'heartRate',
      'cadence',
      'distance',
      'speed',
      'enhancedSpeed',
      'power',
      'calculatedPower',
      'compressedSpeedDistance',

      // 环境和传感器数据
      'grade',
      'resistance',
      'timeFromCourse',
      'cycleLength',
      'temperature',
      'speed1s',
      'cycles',
      'totalCycles',
      'compressedAccumulatedPower',
      'accumulatedPower',
      'leftRightBalance',
      'gpsAccuracy',
      'verticalSpeed',
      'calories',

      // 跑步动态
      'verticalOscillation',
      'stanceTimePercent',
      'stanceTime',

      // 功率相关
      'leftTorqueEffectiveness',
      'rightTorqueEffectiveness',
      'leftPedalSmoothness',
      'rightPedalSmoothness',
      'combinedPedalSmoothness',
      'leftPco',
      'rightPco',
      'leftPowerPhase',
      'leftPowerPhasePeak',
      'rightPowerPhase',
      'rightPowerPhasePeak',

      // 高级传感器
      'cadence256',
      'fractionalCadence',
      'totalHemoglobinConc',
      'totalHemoglobinConcMin',
      'totalHemoglobinConcMax',
      'saturatedHemoglobinPercent',
      'saturatedHemoglobinPercentMin',
      'saturatedHemoglobinPercentMax',
      'respirationRate',
      'enhancedRespirationRate',

      // 设备和环境
      'deviceIndex',
      'batterySoc',
      'motorPower',
      'cycleLength16',
      'absolutePressure',
      'coreTemperature',

      // 活动类型和状态
      'sportType',
      'strokeType',
      'zone',
      'ballSpeed',
      'time128',

      // 电动自行车
      'ebikeTravelRange',
      'ebikeBatteryLevel',
      'ebikeAssistMode',
      'ebikeAssistLevelPercent',

      // 潜水相关
      'depth',
      'nextStopDepth',
      'nextStopTime',
      'timeToSurface',
      'ndlTime',
      'cnsLoad',
      'n2Load',
      'airTimeRemaining',
      'pressureSac',
      'volumeSac',
      'rmv',
      'ascentRate',
      'po2',

      // 高级指标
      'grit',
      'flow',
      'currentStress',
      'verticalRatio',
      'stanceTimeBalance',
      // 步幅
      'stepLength',

      // 计算字段（保持向后兼容）
      'climb',
      'descend',
      'enhancedClimb',
      'enhancedDescend',

      // 兼容字段
      'index',
      'lapIndex',
      'hdop',
      'vdop',
      'pdop',
      'turn',
      'description',
      'pace',
      'gap',
      'aePace',
      'aePower',
      'vo2',
    ];

    // 字段类型分组：字符串、整数、其余默认按 double 处理
    const stringFields = ['hashId', 'sportType', 'strokeType', 'description'];
    const integerFields = ['activityId'];

    return data.map((row) => {
      const normalizedRow: ParquetNormalizedRow = {};
      for (const field of tableFields) {
        if (field === 'timestamp') {
          // 保持原值，后续使用 bindTimestamp 统一处理各种时间格式
          normalizedRow[field] = row[field];
        } else if (stringFields.includes(field)) {
          // 字符串字段保留字符串或置为 null
          normalizedRow[field] =
            row[field] !== undefined && row[field] !== null ? row[field] : null;
        } else if (integerFields.includes(field)) {
          // 整数字段：转换为整数或置为 null
          if (row[field] === undefined || row[field] === null) {
            normalizedRow[field] = null;
          } else {
            const n = Number(row[field]);
            normalizedRow[field] = Number.isFinite(n) ? Math.trunc(n) : null;
          }
        } else {
          // 其余全部按 double 处理，进行浮点规范化
          normalizedRow[field] = this.normalizeFloat(row[field]);
        }
      }
      return normalizedRow;
    });
  }

  /**
   * 标准化 lengthMesg 数据以适配Parquet格式
   */
  private normalizeLengthsForParquet(
    data: SensorLength[],
  ): ParquetNormalizedRow[] {
    // 与临时表字段顺序保持一致，避免字段映射误差
    const tableFields = [
      // 系统字段
      'activityId',
      'hashId',

      // RecordMesgType 核心字段
      'timestamp',
      'index',
      'lapIndex',
      'timestamp',
      'messageIndex',
      'event',
      'eventType',
      'startTime',
      'totalElapsedTime',
      'totalTimerTime',
      'totalStrokes',
      'avgSpeed',
      'swimStroke',
      'avgSwimmingCadence',
      'eventGroup',
      'totalCalories',
      'lengthType',
      'playerScore',
      'opponentScore',
      'strokeCount',
      'zoneCount',
      'enhancedAvgRespirationRate',
      'enHancedMaxRespirationRate',
      'avgRespirationRate',
      'maxRespirationRate',
    ];

    // 字段类型分组：字符串、整数、其余默认按 double 处理
    const stringFields = [
      'hashId',
      'event',
      'eventType',
      'swimStroke',
      'lengthType',
      'eventGroup',
    ];
    const integerFields = ['activityId', 'index', 'lapIndex', 'messageIndex'];

    return data.map((row) => {
      const normalizedRow: ParquetNormalizedRow = {};
      for (const field of tableFields) {
        if (field === 'timestamp' || field === 'startTime') {
          // 保持原值，后续使用 bindTimestamp 统一处理各种时间格式
          normalizedRow[field] = row[field];
        } else if (stringFields.includes(field)) {
          // 字符串字段保留字符串或置为 null
          normalizedRow[field] =
            row[field] !== undefined && row[field] !== null ? row[field] : null;
        } else if (integerFields.includes(field)) {
          // 整数字段：转换为整数或置为 null
          if (row[field] === undefined || row[field] === null) {
            normalizedRow[field] = null;
          } else {
            const n = Number(row[field]);
            normalizedRow[field] = Number.isFinite(n) ? Math.trunc(n) : null;
          }
        } else {
          // 其余全部按 double 处理，进行浮点规范化
          normalizedRow[field] = this.normalizeFloat(row[field]);
        }
      }
      return normalizedRow;
    });
  }

  // 处理浮点数精度问题的辅助方法
  private normalizeFloat(value: unknown): number | null {
    if (value == null) return null;
    const numValue = Number(value);
    if (isNaN(numValue)) return null;
    // 保留6位小数精度，避免浮点数精度问题
    return round(numValue, 6);
  }

  /**
   * convert sensor records to Parquet format
   * @param data SensorRecord[]
   * @returns Buffer
   */
  private async convertRecordToParquet(data: SensorRecord[]): Promise<Buffer> {
    await this.ensureDuckDBInitialized();
    // normalize records to match parquet schema
    const normalizedData = this.normalizeRecordsForParquet(data);
    // use DuckDB to write data to Parquet file
    // 1) create temp table → 2) batch insert → 3) COPY TO parquet → 4) read Buffer → 5) clean up
    // await this.ensureDuckDBInitialized();
    // use independent connection for each write to avoid concurrent conflicts
    const conn = await this.duckDB.connect();
    const tableName = `tmp_records_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const tmpPath = path.join(os.tmpdir(), `${tableName}.parquet`);

    // create temp table with RecordMesgType fields
    const createSql = `
      CREATE TEMP TABLE ${tableName}(
        -- 系统字段
        activityId INTEGER,
        hashId VARCHAR(50),
        -- RecordMesgType 核心字段
        timestamp TIMESTAMP,
        positionLat DOUBLE,
        positionLong DOUBLE,
        altitude DOUBLE,
        enhancedAltitude DOUBLE,
        heartRate DOUBLE,
        cadence DOUBLE,
        distance DOUBLE,
        speed DOUBLE,
        enhancedSpeed DOUBLE,
        power DOUBLE,
        calculatedPower DOUBLE,
        compressedSpeedDistance DOUBLE,
        
        -- 环境和传感器数据
        grade DOUBLE,
        resistance DOUBLE,
        timeFromCourse DOUBLE,
        cycleLength DOUBLE,
        temperature DOUBLE,
        speed1s DOUBLE,
        cycles DOUBLE,
        totalCycles DOUBLE,
        compressedAccumulatedPower DOUBLE,
        accumulatedPower DOUBLE,
        leftRightBalance DOUBLE,
        gpsAccuracy DOUBLE,
        verticalSpeed DOUBLE,
        calories DOUBLE,
        
        -- 跑步动态
        verticalOscillation DOUBLE,
        stanceTimePercent DOUBLE,
        stanceTime DOUBLE,
        
        
        -- 功率相关
        
        leftTorqueEffectiveness DOUBLE,
        rightTorqueEffectiveness DOUBLE,
        leftPedalSmoothness DOUBLE,
        rightPedalSmoothness DOUBLE,
        combinedPedalSmoothness DOUBLE,
        leftPco DOUBLE,
        rightPco DOUBLE,
        leftPowerPhase DOUBLE,
        leftPowerPhasePeak DOUBLE,
        rightPowerPhase DOUBLE,
        rightPowerPhasePeak DOUBLE,
        
        -- 高级传感器
        cadence256 DOUBLE,
        fractionalCadence DOUBLE,
        totalHemoglobinConc DOUBLE,
        totalHemoglobinConcMin DOUBLE,
        totalHemoglobinConcMax DOUBLE,
        saturatedHemoglobinPercent DOUBLE,
        saturatedHemoglobinPercentMin DOUBLE,
        saturatedHemoglobinPercentMax DOUBLE,
        respirationRate DOUBLE,
        enhancedRespirationRate DOUBLE,
        
        -- 设备和环境
        deviceIndex DOUBLE,
        batterySoc DOUBLE,
        motorPower DOUBLE,
        cycleLength16 DOUBLE,
        absolutePressure DOUBLE,
        coreTemperature DOUBLE,
        
        -- 活动类型和状态
        sportType VARCHAR(50),
        strokeType VARCHAR(50),
        zone DOUBLE,
        ballSpeed DOUBLE,
        time128 DOUBLE,
        
        -- 电动自行车
        ebikeTravelRange DOUBLE,
        ebikeBatteryLevel DOUBLE,
        ebikeAssistMode DOUBLE,
        ebikeAssistLevelPercent DOUBLE,
        
        -- 潜水相关
        depth DOUBLE,
        nextStopDepth DOUBLE,
        nextStopTime DOUBLE,
        timeToSurface DOUBLE,
        ndlTime DOUBLE,
        cnsLoad DOUBLE,
        n2Load DOUBLE,
        airTimeRemaining DOUBLE,
        pressureSac DOUBLE,
        volumeSac DOUBLE,
        rmv DOUBLE,
        ascentRate DOUBLE,
        po2 DOUBLE,
        
        -- 高级指标
        grit DOUBLE,
        flow DOUBLE,
        currentStress DOUBLE,
        verticalRatio DOUBLE,
        stanceTimeBalance DOUBLE,
        stepLength DOUBLE,
        
        -- 计算字段（保持向后兼容）
        climb DOUBLE,
        descend DOUBLE,
        enhancedClimb DOUBLE,
        enhancedDescend DOUBLE,
        
        -- 兼容字段 ActivityRecordType
        index DOUBLE,
        lapIndex DOUBLE,
        hdop DOUBLE,
        vdop DOUBLE,
        pdop DOUBLE,
        turn DOUBLE,
        description VARCHAR(255),

        -- 配速与坡度配速
        pace DOUBLE,
        gap DOUBLE,
        aePace DOUBLE,
        aePower DOUBLE,
        -- 生理指标
        vo2 DOUBLE,
      );
    `;

    await conn.run(createSql);

    // prepare batch insert statement
    const fieldCount = 103; // match number of columns in CREATE TEMP TABLE
    const placeholders = Array(fieldCount).fill('?').join(', ');
    const insertSql = `INSERT INTO ${tableName} VALUES (${placeholders})`;
    const prepared = await conn.prepare(insertSql);
    try {
      for (const row of normalizedData) {
        try {
          let paramIndex = 1;

          // bind system fields
          this.bindValue(prepared, paramIndex++, row.activityId, 'integer');
          this.bindValue(prepared, paramIndex++, row.hashId, 'varchar');

          // bind RecordMesgType fields
          this.bindTimestamp(prepared, paramIndex++, row.timestamp);
          this.bindValue(prepared, paramIndex++, row.positionLat, 'double');
          this.bindValue(prepared, paramIndex++, row.positionLong, 'double');
          this.bindValue(prepared, paramIndex++, row.altitude, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.enhancedAltitude,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.heartRate, 'double');
          this.bindValue(prepared, paramIndex++, row.cadence, 'double');
          this.bindValue(prepared, paramIndex++, row.distance, 'double');
          this.bindValue(prepared, paramIndex++, row.speed, 'double');
          this.bindValue(prepared, paramIndex++, row.enhancedSpeed, 'double');
          this.bindValue(prepared, paramIndex++, row.power, 'double');
          this.bindValue(prepared, paramIndex++, row.calculatedPower, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.compressedSpeedDistance,
            'double',
          );
          // bind other fields
          this.bindValue(prepared, paramIndex++, row.grade, 'double');
          this.bindValue(prepared, paramIndex++, row.resistance, 'double');
          this.bindValue(prepared, paramIndex++, row.timeFromCourse, 'double');
          this.bindValue(prepared, paramIndex++, row.cycleLength, 'double');
          this.bindValue(prepared, paramIndex++, row.temperature, 'double');
          this.bindValue(prepared, paramIndex++, row.speed1s, 'double');
          this.bindValue(prepared, paramIndex++, row.cycles, 'double');
          this.bindValue(prepared, paramIndex++, row.totalCycles, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.compressedAccumulatedPower,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.accumulatedPower,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.leftRightBalance,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.gpsAccuracy, 'double');
          this.bindValue(prepared, paramIndex++, row.verticalSpeed, 'double');
          this.bindValue(prepared, paramIndex++, row.calories, 'double');

          // bind running dynamic fields
          this.bindValue(
            prepared,
            paramIndex++,
            row.verticalOscillation,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.stanceTimePercent,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.stanceTime, 'double');

          // bind power fields
          this.bindValue(
            prepared,
            paramIndex++,
            row.leftTorqueEffectiveness,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.rightTorqueEffectiveness,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.leftPedalSmoothness,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.rightPedalSmoothness,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.combinedPedalSmoothness,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.leftPco, 'double');
          this.bindValue(prepared, paramIndex++, row.rightPco, 'double');
          this.bindValue(prepared, paramIndex++, row.leftPowerPhase, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.leftPowerPhasePeak,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.rightPowerPhase, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.rightPowerPhasePeak,
            'double',
          );

          // 高级传感器
          this.bindValue(prepared, paramIndex++, row.cadence256, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.fractionalCadence,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.totalHemoglobinConc,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.totalHemoglobinConcMin,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.totalHemoglobinConcMax,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.saturatedHemoglobinPercent,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.saturatedHemoglobinPercentMin,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.saturatedHemoglobinPercentMax,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.respirationRate, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.enhancedRespirationRate,
            'double',
          );

          // 设备和环境
          this.bindValue(prepared, paramIndex++, row.deviceIndex, 'double');
          this.bindValue(prepared, paramIndex++, row.batterySoc, 'double');
          this.bindValue(prepared, paramIndex++, row.motorPower, 'double');
          this.bindValue(prepared, paramIndex++, row.cycleLength16, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.absolutePressure,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.coreTemperature, 'double');

          // 活动类型和状态
          this.bindValue(prepared, paramIndex++, row.sportType, 'varchar');
          this.bindValue(prepared, paramIndex++, row.strokeType, 'varchar');
          this.bindValue(prepared, paramIndex++, row.zone, 'double');
          this.bindValue(prepared, paramIndex++, row.ballSpeed, 'double');
          this.bindValue(prepared, paramIndex++, row.time128, 'double');

          // 电动自行车
          this.bindValue(
            prepared,
            paramIndex++,
            row.ebikeTravelRange,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.ebikeBatteryLevel,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.ebikeAssistMode, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.ebikeAssistLevelPercent,
            'double',
          );

          // 潜水相关
          this.bindValue(prepared, paramIndex++, row.depth, 'double');
          this.bindValue(prepared, paramIndex++, row.nextStopDepth, 'double');
          this.bindValue(prepared, paramIndex++, row.nextStopTime, 'double');
          this.bindValue(prepared, paramIndex++, row.timeToSurface, 'double');
          this.bindValue(prepared, paramIndex++, row.ndlTime, 'double');
          this.bindValue(prepared, paramIndex++, row.cnsLoad, 'double');
          this.bindValue(prepared, paramIndex++, row.n2Load, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.airTimeRemaining,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.pressureSac, 'double');
          this.bindValue(prepared, paramIndex++, row.volumeSac, 'double');
          this.bindValue(prepared, paramIndex++, row.rmv, 'double');
          this.bindValue(prepared, paramIndex++, row.ascentRate, 'double');
          this.bindValue(prepared, paramIndex++, row.po2, 'double');

          // 高级指标
          this.bindValue(prepared, paramIndex++, row.grit, 'double');
          this.bindValue(prepared, paramIndex++, row.flow, 'double');
          this.bindValue(prepared, paramIndex++, row.currentStress, 'double');
          this.bindValue(prepared, paramIndex++, row.verticalRatio, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.stanceTimeBalance,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.stepLength, 'double');

          // 计算字段（保持向后兼容）
          this.bindValue(prepared, paramIndex++, row.climb, 'double');
          this.bindValue(prepared, paramIndex++, row.descend, 'double');
          this.bindValue(prepared, paramIndex++, row.enhancedClimb, 'double');
          this.bindValue(prepared, paramIndex++, row.enhancedDescend, 'double');

          // 兼容字段
          this.bindValue(prepared, paramIndex++, row.index, 'double');
          this.bindValue(prepared, paramIndex++, row?.lapIndex, 'double');
          this.bindValue(prepared, paramIndex++, row.hdop, 'double');
          this.bindValue(prepared, paramIndex++, row.vdop, 'double');
          this.bindValue(prepared, paramIndex++, row.pdop, 'double');
          this.bindValue(prepared, paramIndex++, row.turn, 'double');
          this.bindValue(prepared, paramIndex++, row.description, 'varchar');
          // 配速与坡度配速
          this.bindValue(prepared, paramIndex++, row.pace, 'double');
          this.bindValue(prepared, paramIndex++, row.gap, 'double');
          this.bindValue(prepared, paramIndex++, row.aePace, 'double');
          this.bindValue(prepared, paramIndex++, row.aePower, 'double');
          // 生理指标
          this.bindValue(prepared, paramIndex++, row.vo2, 'double');

          // 参数数量断言：确保绑定的参数数与占位符一致
          if (paramIndex !== fieldCount + 1) {
            const boundCount = paramIndex - 1;
            const err = new Error(
              `[convertRecordToParquet] 字段数量不匹配：${boundCount} / ${fieldCount}`,
            );
            this.logger.error(err.message);
            throw err;
          }

          await prepared.run();
        } catch (error) {
          this.logger.error(
            `[convertRecordToParquet] 绑定行数据失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          this.logger.error(
            `[convertRecordToParquet] 异常数据行：${JSON.stringify(
              row,
              null,
              2,
            )}`,
          );
          throw error;
        }
      }

      // export Parquet（ZSTD 压缩）
      const copySql = `COPY ${tableName} TO '${tmpPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`;
      await conn.run(copySql);

      // read file content
      const buffer = await fsp.readFile(tmpPath);
      await fsp.unlink(tmpPath).catch(() => void 0);
      await conn.run(`DROP TABLE ${tableName}`);

      return buffer;
    } catch (error) {
      this.logger.error(
        `[convertRecordToParquet] 转换失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // read file content failed, clean up temporary file and table
      await fsp.unlink(tmpPath).catch(() => void 0);
      await conn.run(`DROP TABLE IF EXISTS ${tableName}`).catch(() => void 0);
      throw error;
    } finally {
      // release prepared statement resource
      // disconnect independent connection
      try {
        prepared.destroySync?.();
        conn.disconnectSync?.();
      } catch {}
    }
  }
  /**
   * convert SensorLengths to Parquet format
   * @param data  SensorLength[]
   * @returns  Buffer  Parquet file content
   */
  private async convertLengthToParquet(data: SensorLength[]): Promise<Buffer> {
    await this.ensureDuckDBInitialized();
    // normalize records to match parquet schema

    const normalizedData = this.normalizeLengthsForParquet(data);
    // use DuckDB to write data to Parquet file
    // 1) create temp table → 2) batch insert → 3) COPY TO parquet → 4) read Buffer → 5) clean up
    // await this.ensureDuckDBInitialized();
    // use independent connection for each write to avoid concurrent conflicts
    const conn = await this.duckDB.connect();
    const tableName = `tmp_lengths_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const tmpPath = path.join(os.tmpdir(), `${tableName}.parquet`);

    // create temp table with schema matching RecordMesgType
    const createSql = `
      CREATE TEMP TABLE ${tableName}(
        -- 系统字段
        activityId INTEGER,
        hashId VARCHAR(50),
        -- RecordMesgType 核心字段
        timestamp TIMESTAMP,
        index INTEGER,
        messageIndex INTEGER,
        event VARCHAR(50),
        eventType VARCHAR(50),
        startTime TIMESTAMP,
        totalElapsedTime DOUBLE,
        totalTimerTime DOUBLE,
        totalStrokes DOUBLE,
        avgSpeed DOUBLE,
        swimStroke VARCHAR(50),
        avgSwimmingCadence DOUBLE,
        eventGroup VARCHAR(50),
        totalCalories DOUBLE,
        lengthType VARCHAR(50),
        playerScore DOUBLE,
        opponentScore DOUBLE,
        strokeCount DOUBLE,
        zoneCount DOUBLE,
        enhancedAvgRespirationRate DOUBLE,
        enHancedMaxRespirationRate DOUBLE,
        avgRespirationRate DOUBLE,
        maxRespirationRate DOUBLE,
      );
    `;

    await conn.run(createSql);

    // dynamically generate insert statement placeholders
    const fieldCount = 25; // 根据上面的字段数量调整
    const placeholders = Array(fieldCount).fill('?').join(', ');
    const insertSql = `INSERT INTO ${tableName} VALUES (${placeholders})`;
    const prepared = await conn.prepare(insertSql);
    try {
      for (const row of normalizedData) {
        try {
          let paramIndex = 1;
          // bind system fields
          this.bindValue(prepared, paramIndex++, row.activityId, 'integer');
          this.bindValue(prepared, paramIndex++, row.hashId, 'varchar');
          this.bindTimestamp(prepared, paramIndex++, row.timestamp);
          this.bindValue(prepared, paramIndex++, row.index, 'integer');
          this.bindValue(prepared, paramIndex++, row.messageIndex, 'integer');
          this.bindValue(prepared, paramIndex++, row.event, 'varchar');
          this.bindValue(prepared, paramIndex++, row.eventType, 'varchar');
          this.bindTimestamp(prepared, paramIndex++, row.startTime);
          this.bindValue(
            prepared,
            paramIndex++,
            row.totalElapsedTime,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.totalTimerTime, 'double');
          this.bindValue(prepared, paramIndex++, row.totalStrokes, 'double');
          this.bindValue(prepared, paramIndex++, row.avgSpeed, 'double');
          this.bindValue(prepared, paramIndex++, row.swimStroke, 'varchar');
          this.bindValue(
            prepared,
            paramIndex++,
            row.avgSwimmingCadence,
            'double',
          );
          this.bindValue(prepared, paramIndex++, row.eventGroup, 'varchar');
          this.bindValue(prepared, paramIndex++, row.totalCalories, 'double');
          this.bindValue(prepared, paramIndex++, row.lengthType, 'varchar');
          this.bindValue(prepared, paramIndex++, row.playerScore, 'double');
          this.bindValue(prepared, paramIndex++, row.opponentScore, 'double');
          this.bindValue(prepared, paramIndex++, row.strokeCount, 'double');
          this.bindValue(prepared, paramIndex++, row.zoneCount, 'double');
          this.bindValue(
            prepared,
            paramIndex++,
            row.enhancedAvgRespirationRate,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.enHancedMaxRespirationRate,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.avgRespirationRate,
            'double',
          );
          this.bindValue(
            prepared,
            paramIndex++,
            row.maxRespirationRate,
            'double',
          );

          // 参数数量断言：确保绑定的参数数与占位符一致
          if (paramIndex !== fieldCount + 1) {
            const boundCount = paramIndex - 1;
            const err = new Error(
              `[convertLengthToParquet] 字段数量不匹配：${boundCount} / ${fieldCount}`,
            );
            this.logger.error(err.message);
            throw err;
          }

          await prepared.run();
        } catch (error) {
          this.logger.error(
            `[convertLengthToParquet] 绑定行数据失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          this.logger.error(
            `[convertLengthToParquet] 异常数据行：${JSON.stringify(
              row,
              null,
              2,
            )}`,
          );
          throw error;
        }
      }

      // 导出为 Parquet（ZSTD 压缩）
      const copySql = `COPY ${tableName} TO '${tmpPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`;
      await conn.run(copySql);

      // 读取文件并清理
      const buffer = await fsp.readFile(tmpPath);
      await fsp.unlink(tmpPath).catch(() => void 0);
      await conn.run(`DROP TABLE ${tableName}`);

      return buffer;
    } catch (error) {
      this.logger.error(
        `[convertLengthToParquet] 转换失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // 清理临时文件和表
      await fsp.unlink(tmpPath).catch(() => void 0);
      await conn.run(`DROP TABLE IF EXISTS ${tableName}`).catch(() => void 0);
      throw error;
    } finally {
      // 释放 prepared statement 资源
      // 断开独立连接
      try {
        prepared.destroySync?.();
        conn.disconnectSync?.();
      } catch {}
    }
  }

  /**
   * 辅助方法：bind field to prepared statement
   */
  private bindValue(
    prepared: DuckDBPreparedStatement,
    index: number,
    value: unknown,
    type: 'integer' | 'double' | 'varchar',
  ): void {
    if (value == null || value === undefined) {
      prepared.bindNull(index);
      return;
    }

    switch (type) {
      case 'integer':
        {
          const n = Number(value);
          if (!Number.isFinite(n)) {
            prepared.bindNull(index);
          } else {
            prepared.bindInteger(index, Math.trunc(n));
          }
        }
        break;
      case 'double':
        const normalizedValue = this.normalizeFloat(value);
        if (normalizedValue == null) {
          prepared.bindNull(index);
        } else {
          prepared.bindDouble(index, normalizedValue);
        }
        break;
      case 'varchar':
        prepared.bindVarchar(index, String(value));
        break;
    }
  }

  /**
   * bind timestamp to prepared statement
   */
  private bindTimestamp(
    prepared: DuckDBPreparedStatement,
    index: number,
    timestamp: unknown,
  ): void {
    if (timestamp == null) {
      prepared.bindNull(index);
      return;
    }

    let timestampMs: number;
    if (typeof timestamp === 'bigint') {
      timestampMs = Number(timestamp);
    } else if (timestamp instanceof Date) {
      timestampMs = timestamp.getTime();
    } else if (typeof timestamp === 'number') {
      timestampMs = timestamp;
    } else if (typeof timestamp === 'string') {
      timestampMs = dayjs(timestamp).valueOf();
    } else {
      timestampMs = dayjs(String(timestamp)).valueOf();
    }

    const micros = BigInt(timestampMs * 1000); // 毫秒转微秒
    if (!this.duckDBTimestampValue) {
      throw new Error('DuckDB timestamp binding is not initialized');
    }
    const timestampValue = new this.duckDBTimestampValue(micros);
    prepared.bindTimestamp(index, timestampValue);
  }

  /**
   * get time format string for timestamp
   */
  private getTimeFormat(granularity: string): string {
    switch (granularity) {
      case 'second':
        return '%Y-%m-%d %H:%M:%S';
      case 'minute':
        return '%Y-%m-%d %H:%M';
      case 'hour':
        return '%Y-%m-%d %H';
      case 'day':
        return '%Y-%m-%d';
      case 'week':
        return '%Y-W%W';
      case 'month':
        return '%Y-%m';
      default:
        return '%Y-%m-%d';
    }
  }

  /**
   * execute query using DuckDB
   */
  private async executeQuery(
    sql: string,
    params: DuckDBQueryParam[] = [],
  ): Promise<DuckDBResultRow[]> {
    try {
      await this.ensureDuckDBInitialized();
      if (!this.connection) {
        throw new Error('DuckDB connection not initialized');
      }

      // 如果有参数，使用 prepared statement
      if (params && params.length > 0) {
        const prepared = await this.connection.prepare(sql);
        try {
          // 绑定参数
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            if (typeof param === 'string') {
              prepared.bindVarchar(i + 1, param);
            } else if (typeof param === 'number') {
              if (Number.isInteger(param)) {
                prepared.bindInteger(i + 1, param);
              } else {
                prepared.bindDouble(i + 1, param);
              }
            } else if (param instanceof Date) {
              prepared.bindVarchar(i + 1, param.toISOString());
            } else if (param === null) {
              prepared.bindNull(i + 1);
            } else {
              prepared.bindVarchar(i + 1, String(param));
            }
          }

          const result = await prepared.run();
          return await result.getRows();
        } finally {
          // 释放 prepared 资源，避免句柄泄漏
          try {
            prepared.destroySync();
          } catch {}
        }
      } else {
        // 没有参数，直接执行
        const result = await this.connection.run(sql);
        return await result.getRows();
      }
    } catch (error) {
      this.logger.error(
        `[executeQuery] 执行查询失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * normalize rows returned by DuckDB
   */
  private normalizeRows(
    rows: DuckDBResultRow[],
    columns: string[],
  ): DuckDBNormalizedRow[] {
    return (rows || []).map((r) => {
      if (Array.isArray(r)) {
        const obj: DuckDBNormalizedRow = {};
        for (let i = 0; i < columns.length; i++) {
          let value = r[i];
          if (typeof value === 'bigint') value = Number(value);
          obj[columns[i]] = value;
        }
        return obj;
      }
      return r;
    });
  }

  /**
   * map client metric name (camelCase) to Parquet column name (snake_case)
   */
  private mapMetricToColumn(metric: string): string {
    if (!metric) return metric;
    const normalized = metric.replace(/[_\s]/g, '').toLowerCase();
    switch (normalized) {
      // 心率相关
      case 'heartrate':
        return 'heartRate';

      // 海拔相关
      case 'elevation':
      case 'ele':
        return 'altitude';
      case 'enhancedelevation':
      case 'enhancedele':
      case 'enhancedaltitude':
        return 'enhancedAltitude';

      // 位置相关
      case 'positionlat':
      case 'lat':
      case 'latitude':
        return 'positionLat';
      case 'positionlong':
      case 'lng':
      case 'lon':
      case 'longitude':
        return 'positionLong';

      // 速度相关
      case 'enhancedspeed':
        return 'enhancedSpeed';
      case 'speed1s':
        return 'speed1s';

      case 'grade':
        return 'grade';
      case 'gap':
        return `gap`;

      case 'aepace':
        return 'aePace';
      case 'aepower':
        return 'aePower';

      // 计算字段
      case 'climb':
        return 'climb';
      case 'descend':
        return 'descend';
      case 'enhancedclimb':
        return 'enhancedClimb';
      case 'enhanceddescend':
        return 'enhancedDescend';

      // 功率相关
      case 'accumulatedpower':
        return 'accumulatedPower';
      case 'compressedaccumulatedpower':
        return 'compressedAccumulatedPower';
      case 'motorpower':
        return 'motorPower';
      case 'calculatedpower':
        return 'calculatedPower';

      // 踏频相关
      case 'cadence256':
        return 'cadence256';
      case 'fractionalcadence':
        return 'fractionalCadence';

      // 平衡相关
      case 'leftrightbalance':
        return 'leftRightBalance';
      case 'stancetimebalance':
        return 'stanceTimeBalance';

      // GPS相关
      case 'gpsaccuracy':
        return 'gpsAccuracy';
      case 'verticalspeed':
        return 'verticalSpeed';

      // 跑步动态
      case 'verticaloscillation':
        return 'verticalOscillation';
      case 'stancetimepercent':
        return 'stanceTimePercent';
      case 'stancetime':
        return 'stanceTime';
      case 'verticalratio':
        return 'verticalRatio';
      case 'steplength':
        return 'stepLength';

      // 踏板相关
      case 'lefttorqueeffectiveness':
        return 'leftTorqueEffectiveness';
      case 'righttorqueeffectiveness':
        return 'rightTorqueEffectiveness';
      case 'leftpedalsmoothness':
        return 'leftPedalSmoothness';
      case 'rightpedalsmoothness':
        return 'rightPedalSmoothness';
      case 'combinedpedalsmoothness':
        return 'combinedPedalSmoothness';
      case 'leftpco':
        return 'leftPco';
      case 'rightpco':
        return 'rightPco';
      case 'leftpowerphase':
        return 'leftPowerPhase';
      case 'leftpowerphasepeak':
        return 'leftPowerPhasePeak';
      case 'rightpowerphase':
        return 'rightPowerPhase';
      case 'rightpowerphasepeak':
        return 'rightPowerPhasePeak';

      // 环境相关
      case 'absolutepressure':
        return 'absolutePressure';
      case 'coretemperature':
        return 'coreTemperature';

      // 血氧相关
      case 'totalhemoglobinconc':
        return 'totalHemoglobinConc';
      case 'totalhemoglobinconcmin':
        return 'totalHemoglobinConcMin';
      case 'totalhemoglobinconcmax':
        return 'totalHemoglobinConcMax';
      case 'saturatedhemoglobinpercent':
        return 'saturatedHemoglobinPercent';
      case 'saturatedhemoglobinpercentmin':
        return 'saturatedHemoglobinPercentMin';
      case 'saturatedhemoglobinpercentmax':
        return 'saturatedHemoglobinPercentMax';

      // 呼吸相关
      case 'respirationrate':
        return 'respirationRate';
      case 'enhancedrespirationrate':
        return 'enhancedRespirationRate';

      // 电池相关
      case 'batterysoc':
        return 'batterySoc';
      case 'ebikebatterylevel':
        return 'ebikeBatteryLevel';

      // 电动自行车相关
      case 'ebiketravelrange':
        return 'ebikeTravelRange';
      case 'ebikeassistmode':
        return 'ebikeAssistMode';
      case 'ebikeassistlevelpercent':
        return 'ebikeAssistLevelPercent';

      // 潜水相关
      case 'nextstopDepth':
        return 'nextStopDepth';
      case 'nextstoptime':
        return 'nextStopTime';
      case 'timetosurface':
        return 'timeToSurface';
      case 'ndltime':
        return 'ndlTime';
      case 'cnsload':
        return 'cnsLoad';
      case 'n2load':
        return 'n2Load';
      case 'airtimeremaining':
        return 'airTimeRemaining';
      case 'pressuresac':
        return 'pressureSac';
      case 'volumesac':
        return 'volumeSac';
      case 'ascentrate':
        return 'ascentRate';

      // 其他字段
      case 'sportType':
        return 'sportType';
      case 'stroketype':
        return 'strokeType';
      case 'ballspeed':
        return 'ballSpeed';
      case 'deviceindex':
        return 'deviceIndex';
      case 'timefromcourse':
        return 'timeFromCourse';
      case 'cyclelength':
        return 'cycleLength';
      case 'cyclelength16':
        return 'cycleLength16';
      case 'totalcycles':
      case 'totalstrokes':
        // RecordMesg 中为 FIT「累计周期/划数」列 totalCycles；长度消息 length Parquet 另有 totalStrokes
        return 'totalCycles';
      case 'currentness':
        return 'currentStress';
      case 'time128':
        return 'time128';

      default:
        return metric; // 其余与列名一致，如 speed/altitude/power/cadence/distance/temperature/calories/resistance/zone/grit/flow/po2/rmv/cycles
    }
  }

  /**
   * 关闭数据库连接
   */
  async onModuleDestroy() {
    try {
      if (this.connection) {
        this.connection.disconnectSync();
      }
      this.logger.log('DuckDB 连接已关闭');
    } catch (error) {
      this.logger.error(
        `关闭 DuckDB 连接失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
