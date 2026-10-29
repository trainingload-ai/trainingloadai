import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PrismaService } from '@/prisma/prisma.service';
import { computeGapPaceSecondsPerMeter } from '@/algorithm/gap';
import { calculateCp } from '@/algorithm/fitness-cp';
import { STORAGE_PORT, type StoragePort } from '@/storage/storage.port';
import {
  SensorDataService,
  SensorLength,
  SensorRecord,
  type StagedActivityParquetFile,
} from '@/sensor/sensor-data.service';
import { SensorFileQueryService } from '@/sensor/sensor-file-query.service';
import { UserQueryService } from '@/api/user/user-query.service';
import type {
  ActivityLapType,
  ActivityRecordType,
  ActivityType,
  FileType,
} from 'trackswap';
import JSZip from 'jszip';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');

dayjs.extend(utc);
import { getPreciseDistance } from 'geolib';
import { toMs } from '@/utils';
import { ActivitySportTypeItem } from './dto/set-sport-type.dto';
import { defaultSportDefinitionCode } from '@/sports/sport-catalog.types';
import { EstimateCpFromFilesDto } from './dto/estimate-cp.dto';
import type { Request } from 'express';
import {
  $Enums,
  Activity,
  ActivityStatus,
  SportType,
  PeakType,
  ScaleType,
  Gender,
  ZoneType,
  Prisma,
} from '@prisma/client';
import { powerService } from '@/power/power.service';
import {
  estimateCalculatedPower,
  measuredPowerCoverage,
} from '@/algorithm/power';
import { sanitizeActivityRecordSpeeds } from '@/algorithm/instantaneous-speed';
import { HeartRateBaseResultDto } from './dto/heart-base.dto';
import { HeartRateDurationCurvePoint } from '@/heart-rate/heart-rate.interfaces';
import { SwimReviewResult } from './activity.interface';
import { PowerBasicResponse, DurationCurve } from '@/power/power.interface';
import { round } from 'lodash';
import { AlgorithmService } from '@/analyze/algorithm.service';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitPmcInvalidate } from '@/training-load/events/pmc.events';
import {
  findBestAverageForTime,
  findBestTimeForDistance,
} from '@/algorithm/window-analysis.util';
import { UserService } from '../user/user.service';
import { UserTimezoneInitializerService } from '@/timezone/user-timezone-initializer.service';
import { resolveEffectiveActivityVo2Max } from '@/analyze/vo2max/vo2max-source';
import { LoadReadoutService } from './load-readout.service';
import { isActivityWithinGlobalRefreshWindow } from '@/utils/activity-global-refresh-window';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { AnalyzeFitnessOrchestratorService } from '@/analyze/analyze-fitness-orchestrator.service';
import { selectActivityGlobalRefreshScope } from '@/utils/activity-global-refresh-window';
import { StorageObjectGarbageCollectorService } from '@/sensor/parquet-garbage-collector.service';

function isSportType(value: string): value is $Enums.SportType {
  return (Object.values($Enums.SportType) as string[]).includes(value);
}

function optionalRecordNumber(record: object, key: string): number | undefined {
  const raw = (record as Record<string, unknown>)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

import { HeartRateService } from '@/heart-rate/heart-rate.service';
import {
  applySmoothing,
  CYCLING_GRADE_LOOKAHEAD_METERS,
  ELEVATE_GRADE_DEFAULT_LOOKAHEAD_METERS,
  RUN_GRADE_LOOKAHEAD_METERS,
} from '@/algorithm/smoothing/smoothing.util';
import {
  runPipeline,
  type PipelineStage,
  type MacroSensorExtractPipelineContext,
  type ActivityAnalyzePipelineContext,
} from './pipeline';
import type { CanonicalActivityPayload } from '@/importing/canonical-activity.types';
import { mapCanonicalPayloadToTrackSwapActivity } from '@/importing/source-adapters/trackswap-canonical.mapper';
import {
  decodeTrackActivity,
  encodeTrackActivity,
  transcodeTrackFile,
  type TrackFileFormat,
} from '@/importing/trackswap-file';
import {
  mapTrackFileRequestError,
  TRACK_FILE_REQUEST_ERROR,
  trackFileBadRequest,
} from '@/importing/track-file-request-error';
import type { MetricsTaskOutcome } from './metrics/context';
import { ActivityAnalyzeMode } from './metrics/activity-analyze-mode';
import { ActivityMetricsPipelineService } from './metrics/activity-metrics-pipeline.service';
import { ActivityMapDerivationService } from './activity-map-derivation.service';
import { ActivityQueryService } from './activity-query.service';
import { ActivityAiReviewService } from './activity-ai-review.service';
import { ActivityMapThumbJobService } from './activity-map-thumb-job.service';
import { PlanLinkMatcherService } from '@/api/plan/plan-link-matcher.service';
import { PlanActivityLinkService } from '@/api/plan/application/plan-activity-link.service';
import { TimezoneInferenceService } from '@/timezone/timezone-inference.service';
import { ActivityWeatherService } from '@/weather/activity-weather.service';

/** preprocessComputedFields 入参（避免位置参数混用体重与海拔阈值） */
interface PreprocessComputedFieldsOptions {
  sportType?: SportType;
  sportDefinitionCode?: string | null;
  userWeightKg?: number;
  userHeight?: number;
  altitudeThreshold?: number;
}

export { ActivityAnalyzeMode } from './metrics/activity-analyze-mode';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PORT) private storageService: StoragePort,
    private sensorDataService: SensorDataService,
    private readonly powerService: powerService,
    private readonly heartRateService: HeartRateService,
    private readonly algorithmService: AlgorithmService,
    private readonly events: EventEmitter2,
    private readonly userService: UserService,
    private readonly timezoneInitializer: UserTimezoneInitializerService,
    private readonly i18n: I18nService,
    private readonly metricsPipeline: ActivityMetricsPipelineService,
    private readonly activityQuery: ActivityQueryService,
    private readonly mapDerivation: ActivityMapDerivationService,
    private readonly activityAiReviewService: ActivityAiReviewService,
    private readonly activityMapThumbJobService: ActivityMapThumbJobService,
    private readonly loadReadout: LoadReadoutService,
    private readonly planLinkMatcher: PlanLinkMatcherService,
    private readonly planActivityLinks: PlanActivityLinkService,
    private readonly timezoneInference: TimezoneInferenceService,
    private readonly fitnessOrchestrator: AnalyzeFitnessOrchestratorService,
    private readonly storageGarbageCollector: StorageObjectGarbageCollectorService,
    private readonly sensorFiles: SensorFileQueryService,
    private readonly users: UserQueryService,
    private readonly activityWeather: ActivityWeatherService,
  ) {}

  /**
   * 刷新因为活动变更而需要更新的全局数据。
   * @param userId - 用户 ID。
   * @param activities - 活动。
   * @returns 刷新结果。
   */
  private async refreshUserGlobalsAfterActivityChanges(
    userId: string,
    activities: ReadonlyArray<{
      sportType?: SportType | null;
      startTime?: Date | null;
    }>,
  ): Promise<void> {
    // 选择需要更新的全局数据
    const refreshScope = selectActivityGlobalRefreshScope(activities);
    if (refreshScope.eligibleCount === 0) return;

    // 刷新用户健身档案
    await this.fitnessOrchestrator.refreshUserFitnessProfile(
      userId,
      refreshScope.sportTypes,
    );
    // 刷新 PMC
    // 发出 PMC 跨模块重算事件。只在写入提交之后发出。
    // listener 放在 PMC 模块内；Activity / Import / Coach 不直接调 calculatePMC。
    await emitPmcInvalidate(this.events, userId);
  }

  /** Activity.timezone 为空且有起点坐标时，用 geo-tz 补写 IANA；已有来源时区不覆盖。 */
  private async applyGeoInferredTimezoneIfNeeded(
    activityId: number,
  ): Promise<void> {
    const row = await this.prisma.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        timezone: true,
        startLat: true,
        startLng: true,
      },
    });
    if (!row?.id || row.timezone) return;
    if (row.startLat == null || row.startLng == null) return;
    const tz = this.timezoneInference.findIanaTimezone(
      Number(row.startLat),
      Number(row.startLng),
    );
    if (!tz) return;
    await this.prisma.activity.update({
      where: { id: row.id },
      data: { timezone: tz },
    });
  }

  /**
   * 获取那个一个文件中最重要的那个活动
   */
  private pickPrimaryActivity(activities: ActivityType[]): ActivityType {
    if (!activities || activities.length === 0) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.ACTIVITY_REQUIRED);
    }
    if (activities.length === 1) return activities[0];
    const scored = activities
      .map((a) => {
        const timer = Number(a.totalTimerTime || 0);
        return { a, score: timer * 1000 };
      })
      .sort((x, y) => y.score - x.score);
    return scored[0].a;
  }

  private calculateCpFromTimeSeries(
    timeSeries: { tMs: number; r: SensorRecord }[],
    testType: EstimateCpFromFilesDto['testType'],
    weightKg?: number,
  ) {
    if (timeSeries.length < 2) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.TIMESTAMPS_REQUIRED);
    }

    const firstMs = timeSeries[0].tMs;
    const lastMs = timeSeries[timeSeries.length - 1].tMs;
    const durationSec = (lastMs - firstMs) / 1000;

    const powerSeries = timeSeries
      .map((x) => ({
        tMs: x.tMs,
        value: Number(x.r.power),
      }))
      .filter(
        (p) =>
          Number.isFinite(p.tMs) && Number.isFinite(p.value) && p.value >= 0,
      )
      .sort((a, b) => a.tMs - b.tMs);

    if (powerSeries.length < 2) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.POWER_REQUIRED);
    }

    const p3m = findBestAverageForTime(powerSeries, 180);
    if (!p3m || p3m <= 0) {
      throw trackFileBadRequest(
        TRACK_FILE_REQUEST_ERROR.POWER_WINDOW_REQUIRED,
        {
          data: { requiredSeconds: 180 },
          messageArgs: { requiredSeconds: 180 },
        },
      );
    }

    let longDurationSec: number;
    let tenKmTimeSec: number | undefined = undefined;
    if (testType === 'three_nine') {
      longDurationSec = 540;
    } else if (testType === 'thirty_min') {
      longDurationSec = 1800;
    } else {
      const distanceSeries = timeSeries
        .map((x) => ({
          tMs: x.tMs,
          dM: Number(x.r.distance),
        }))
        .filter(
          (p) => Number.isFinite(p.tMs) && Number.isFinite(p.dM) && p.dM >= 0,
        )
        .sort((a, b) => a.tMs - b.tMs);

      if (distanceSeries.length < 2) {
        throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.DISTANCE_REQUIRED);
      }

      const bestTime = findBestTimeForDistance(distanceSeries, 10000);
      if (!bestTime || bestTime <= 0) {
        throw trackFileBadRequest(
          TRACK_FILE_REQUEST_ERROR.DISTANCE_SEGMENT_REQUIRED,
          {
            data: { requiredDistanceMeters: 10_000 },
            messageArgs: { requiredDistanceKm: 10 },
          },
        );
      }
      tenKmTimeSec = Math.round(bestTime);
      longDurationSec = tenKmTimeSec;
    }

    if (durationSec < longDurationSec) {
      const actualSeconds = Math.round(durationSec);
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.DURATION_TOO_SHORT, {
        data: { actualSeconds, requiredSeconds: longDurationSec },
        messageArgs: { actualSeconds, requiredSeconds: longDurationSec },
      });
    }

    const pLong = findBestAverageForTime(powerSeries, longDurationSec);
    if (!pLong || pLong <= 0) {
      throw trackFileBadRequest(
        TRACK_FILE_REQUEST_ERROR.POWER_WINDOW_REQUIRED,
        {
          data: { requiredSeconds: longDurationSec },
          messageArgs: { requiredSeconds: longDurationSec },
        },
      );
    }

    const t1 = 180;
    const t2 = longDurationSec;
    if (t2 <= t1) {
      throw new Error('Invalid CP test duration configuration');
    }

    const cpRaw = (pLong * t2 - p3m * t1) / (t2 - t1);
    const cp = Math.round(cpRaw);
    if (!Number.isFinite(cp) || cp <= 0) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.ESTIMATE_FAILED);
    }

    const wPrimeJ = Math.round((p3m - cpRaw) * t1);
    const ftp = Math.round(cp * 0.95);
    const cpWKg = weightKg && weightKg > 0 ? round(cp / weightKg, 2) : null;

    return {
      cp,
      ftp,
      wPrimeJ,
      cpWKg,
      durationSec: Math.round(durationSec),
      p3m: round(p3m, 1),
      pLong: round(pLong, 1),
      longDurationSec,
      tenKmTimeSec,
    };
  }
  /**
   * 外部方法，根据文件预估CP
   */
  async estimateCpFromFiles(
    files: Express.Multer.File[],
    dto: EstimateCpFromFilesDto,
  ): Promise<
    {
      fileName: string;
      sportType: SportType;
      testType: EstimateCpFromFilesDto['testType'];
      cp: number;
      ftp: number;
      wPrimeJ: number;
      cpWKg: number | null;
      durationSec: number;
      derived: {
        p3m: number;
        pLong: number;
        longDurationSec: number;
        tenKmTimeSec?: number;
      };
    }[]
  > {
    if (!files || files.length === 0) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.REQUIRED, {
        origin: 'REQUEST',
      });
    } else if (files.length > 1) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.SINGLE_REQUIRED, {
        data: { receivedCount: files.length },
        origin: 'REQUEST',
      });
    }

    const results: Array<{
      fileName: string;
      sportType: SportType;
      testType: EstimateCpFromFilesDto['testType'];
      cp: number;
      ftp: number;
      wPrimeJ: number;
      cpWKg: number | null;
      durationSec: number;
      derived: {
        p3m: number;
        pLong: number;
        longDurationSec: number;
        tenKmTimeSec?: number;
      };
    }> = [];
    for (const file of files) {
      // 通过 trackswap 来解析
      const parsed = await this.parseActivityFileWithFile(file);
      const activityData = this.pickPrimaryActivity(parsed.activities || []);

      const sportType = dto.sportType || SportType.RUN;
      let sensorRecords = this.extractSensorRecordsFromActivity(activityData);

      if (!sensorRecords || sensorRecords.length < 2) {
        throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.RECORDS_REQUIRED);
      }

      const originalPowerMissingRatio =
        sensorRecords.filter(
          (r) => r.power == null || Number.isNaN(Number(r.power)),
        ).length / sensorRecords.length;

      if (originalPowerMissingRatio === 1) {
        throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.POWER_REQUIRED);
      }

      sensorRecords = this.preprocessComputedFields(sensorRecords, {
        sportType,
      });

      const timeSeries = sensorRecords
        .map((r) => ({ tMs: toMs(r.timestamp), r }))
        .filter((x) => x.tMs != null)
        .sort((a, b) => (a.tMs as number) - (b.tMs as number));

      if (timeSeries.length < 2) {
        throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.TIMESTAMPS_REQUIRED);
      }

      const {
        cp,
        ftp,
        wPrimeJ,
        cpWKg,
        durationSec,
        p3m,
        pLong,
        longDurationSec,
        tenKmTimeSec,
      } = this.calculateCpFromTimeSeries(
        timeSeries as { tMs: number; r: SensorRecord }[],
        dto.testType,
        dto.weightKg,
      );

      results.push({
        fileName: file.originalname,
        sportType,
        testType: dto.testType,
        cp,
        ftp,
        wPrimeJ,
        cpWKg,
        durationSec,
        derived: {
          p3m,
          pLong,
          longDurationSec,
          tenKmTimeSec,
        },
      });
    }

    return results;
  }

  /** 大管道：提取传感器数据 生成 Parquet 文件，然后再通过子管道进行分析 */
  private getMacroSensorExtractStages(
    mode: ActivityAnalyzeMode = ActivityAnalyzeMode.FULL,
  ): PipelineStage<MacroSensorExtractPipelineContext>[] {
    return [
      {
        // 提取传感器数据 生成 Parquet 文件
        name: 'extractAndPersistSensor',
        run: async (ctx) => {
          await this.extractSensorDataFromSubActivity(
            ctx.activity,
            ctx.activityFile,
          );
          this.logger.log(
            `[提取 record] 文件生成完毕，开始分析 ${ctx.activity.id}`,
          );
        },
      },
      // 分析第一步 根据 records 来针对活动进行 light 分析
      {
        name: 'analyzeAndPersistCore',
        run: async (ctx) => {
          await this.analyzeAndPersistCore(ctx.activity, ctx.userId, mode);
        },
      },
    ];
  }

  /**
   * 将 record 转换为 sensor 数据，并存储进入 parquet 文件中
   * 从 sensor 数据自底层开始分析。
   * 管道成功结束后：异步从 record Parquet 抽 polyline、落库，并入队地图缩略图任务（入队逻辑内置去重）。
   */
  private async extractParquetAndParseSensorData(
    activity: Activity,
    activityFile: ActivityType,
    userId: string,
    mode: ActivityAnalyzeMode = ActivityAnalyzeMode.LIGHT,
  ): Promise<Activity> {
    try {
      const ctx: MacroSensorExtractPipelineContext = {
        activity,
        activityFile,
        userId,
      };
      // 管道开启
      await runPipeline(
        ctx,
        this.getMacroSensorExtractStages(mode),
        this.logger,
      );
    } catch (e) {
      this.logger.error(
        `[提取 record] 分析文件失败 ${
          activity.id
        } 失败： ${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
    // record Parquet 已就绪（含 analyze 子阶段完成）
    void this.mapDerivation.scheduleAfterSensorImport(activity);
    return activity;
  }

  /**
   * use trackswap to parse activity file with file
   */
  private async parseActivityFileWithFile(
    file: Express.Multer.File,
  ): Promise<FileType> {
    try {
      return await decodeTrackActivity(file.buffer, {
        filename: file.originalname,
      });
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      const fileError = mapTrackFileRequestError(e, {
        filename: file.originalname,
      });
      if (fileError) {
        throw fileError;
      }
      throw e;
    }
  }

  /**
   * parse activity file with buffer
   * @param buffer activity file buffer
   * @param fileType file type (gpx/fit/tcx)
   * @returns parsed activity data
   */
  private async parseActivityFileWithBuffer(
    buffer: Buffer,
    fileType: 'gpx' | 'fit' | 'tcx',
  ): Promise<FileType> {
    try {
      return await decodeTrackActivity(buffer, {
        expectedFormat: fileType,
      });
    } catch (e) {
      this.logger.error(
        `[解析活动文件] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }
  }

  /**
   * 转换：批量文件 → 目标格式（gpx/fit/tcx）
   */
  async convertFiles(
    files: Express.Multer.File[],
    targetType: 'gpx' | 'tcx' | 'fit',
    expectedSourceType?: TrackFileFormat,
  ): Promise<{
    type: 'file' | 'zip';
    filename: string;
    content: Buffer;
    sourceFormats: TrackFileFormat[];
  }> {
    let currentFilename: string | undefined;
    try {
      if (!files || files.length === 0) {
        throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.REQUIRED, {
          origin: 'REQUEST',
        });
      }
      const results: Array<{
        target: Buffer;
        sourceFormat: TrackFileFormat;
      }> = [];
      for (const file of files) {
        currentFilename = file.originalname;
        const converted = await transcodeTrackFile(file.buffer, targetType, {
          expectedFormat: expectedSourceType,
          filename: file.originalname,
        });
        results.push({
          target: converted.content,
          sourceFormat: converted.sourceFormat,
        });
      }
      const sourceFormats = results.map((result) => result.sourceFormat);
      if (results.length === 1) {
        const { target } = results[0];
        const filename = `convert_${dayjs().valueOf()}.${targetType}`;
        return {
          type: 'file',
          filename,
          content: target,
          sourceFormats,
        };
      }
      // 多文件 → zip
      const zip = new JSZip();
      const timestamp = dayjs().valueOf();
      await Promise.all(
        results.map(async (result, idx) => {
          const filename = `convert_${timestamp}_${idx}.${targetType}`;
          zip.file(filename, result.target);
        }),
      );
      const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
      const zipFilename = `convert_${timestamp}.zip`;
      return {
        type: 'zip',
        filename: zipFilename,
        content: zipContent,
        sourceFormats,
      };
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      const fileError = mapTrackFileRequestError(e, {
        expectedFormat: expectedSourceType,
        filename: currentFilename,
        targetFormat: targetType,
      });
      if (fileError) {
        throw fileError;
      }
      throw e;
    }
  }

  /**
   * 转换：基于活动 hashId → 目标格式
   */
  async convertByHashId(
    hashId: string,
    targetType: 'gpx' | 'tcx' | 'fit',
    userId: string,
  ): Promise<{ filename: string; content: Buffer }> {
    try {
      const activity = await this.prisma.activity.findFirst({
        where: readyActivityWhere({ hashId }),
      });
      if (!activity) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('error.no_current_activity'),
        });
      }
      if (activity.userId && userId && activity.userId !== userId) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('error.no_permission'),
        });
      } else if (activity.userId && !userId) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('error.login_required'),
        });
      }
      const fileBuffer = await this.storageService.getFileWithKey(
        activity.fileKey,
      );
      if (!fileBuffer) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.UPLOAD_NO_FILE,
          message: this.i18n.t('error.file_content_failed'),
        });
      }
      const convertedFile = await transcodeTrackFile(fileBuffer, targetType);
      const filename = `convert_${dayjs().valueOf()}.${targetType}`;
      return { filename, content: convertedFile.content };
    } catch (e) {
      this.logger.error(
        `[按 hashId 转换文件] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 编辑：上传文件并返回 ActivityType 列表
   */
  async editUploadFiles(
    files: Express.Multer.File[],
    _req?: Request,
  ): Promise<FileType[]> {
    try {
      const results: FileType[] = [];
      for (const file of files) {
        const target = await decodeTrackActivity(file.buffer, {
          filename: file.originalname,
        });
        results.push(target);
      }
      return results;
    } catch (e) {
      this.logger.error(
        `[编辑上传文件] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 编辑：根据前端传入的 ActivityType 导出指定格式文件
   */
  async generateFileWithActivityFile(
    activityFile: FileType,
    target: 'gpx' | 'fit' | 'tcx',
  ): Promise<Buffer> {
    try {
      return await encodeTrackActivity(activityFile, target);
    } catch (e) {
      this.logger.error(
        `[根据活动数据生成文件] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  async getMapThumbnailUrlsForAi(args: {
    userId: string;
    activityIds: number[];
  }): Promise<Map<number, string>> {
    const ids = Array.from(
      new Set(
        args.activityIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (ids.length === 0) return new Map();

    const thumbUrlMap =
      await this.activityMapThumbJobService.getSucceededThumbUrlMap(ids);
    const missingIds = ids.filter((id) => !thumbUrlMap.has(id));
    if (missingIds.length > 0) {
      void this.mapDerivation
        .ensureThumbsBestEffort(missingIds, args.userId)
        .catch((err) => {
          this.logger.warn(
            `[活动地图缩略图] AI 摘要兜底入队失败 userId=${args.userId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    }

    return thumbUrlMap;
  }

  /**
   * 删除单个活动
   * 用户删除是硬删除，同时清理关联第三方活动；派生对象先进入延迟回收清单。
   */
  async deleteActivity(userId: string, hashId: string): Promise<boolean> {
    const result = await this.prisma.$transaction((tx) =>
      this.deleteActivityInTransaction(userId, hashId, tx),
    );
    await result.afterCommit();
    return true;
  }

  async deleteActivityInTransaction(
    userId: string,
    hashId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ afterCommit: () => Promise<void> }> {
    const where: Prisma.ActivityWhereInput = readyActivityWhere({ hashId });
    if (userId) where.userId = userId;
    const activity = await tx.activity.findFirst({ where });
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }

    // 删除活动会级联删除 link；先记住由该 link 自动完成的课程，删除后再恢复孤儿课程。
    const autoCompletedWorkoutIds =
      await this.planActivityLinks.findAutoCompletedWorkoutIdsForActivity(
        activity.id,
        tx,
      );

    // 查找与该活动有关联的第三方活动
    const mappings = await tx.activityThirdPartyMapping.findMany({
      where: { activityId: activity.id },
      select: { thirdPartyActivityId: true },
    });
    const thirdPartyActivityIds = mappings.map((m) => m.thirdPartyActivityId);

    // 在事务中删除活动及其关联的第三方活动和派生对象
    const [parquetFiles, mapThumb] = await Promise.all([
      this.sensorFiles.parquetFiles(tx).findMany({
        where: { activityId: activity.id },
        select: { parquetPath: true },
      }) as Promise<Array<{ parquetPath: string }>>,
      tx.activityMapThumbJob.findUnique({
        where: { activityId: activity.id },
        select: { r2Key: true, r2DarkKey: true },
      }),
    ]);
    await this.storageGarbageCollector.enqueueObjects(
      [
        ...parquetFiles.map((file) => ({
          activityId: activity.id,
          objectKey: file.parquetPath,
          bucket: 'default',
        })),
        ...[mapThumb?.r2Key, mapThumb?.r2DarkKey]
          .filter((key): key is string => Boolean(key))
          .map((objectKey) => ({
            activityId: activity.id,
            objectKey,
            bucket: 'public',
          })),
      ],
      'activity_hard_deleted',
      undefined,
      tx,
    );

    // 先删除第三方活动（会级联删除映射）
    if (thirdPartyActivityIds.length > 0) {
      await tx.thirdPartyActivity.deleteMany({
        where: { id: { in: thirdPartyActivityIds }, userId },
      });
    }
    await tx.activity.delete({ where: { id: activity.id } });
    await this.planActivityLinks.restoreOrphanedAutoCompletedWorkouts(
      autoCompletedWorkoutIds,
      tx,
    );

    return {
      afterCommit: () =>
        this.refreshUserGlobalsAfterActivityChanges(userId, [activity]),
    };
  }

  /**
   * 更新活动的用户录入 Session RPE。
   */
  async setActivitySessionRpeByHash(
    userId: string,
    hashId: string,
    raw: number | null,
  ): Promise<{
    hashId: string;
    activityId: number;
    sessionRpe: number | null;
  }> {
    const normalizedHashId = hashId.trim();
    const normalized = ActivityService.normalizeSessionRpePayload(raw);
    if (normalized === 'invalid') {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_session_rpe'),
      });
    }

    const activityWithLoadContext = await this.prisma.activity.findFirst({
      where: readyActivityWhere({ hashId: normalizedHashId, userId }),
      select: {
        id: true,
        startTime: true,
      },
    });
    if (!activityWithLoadContext) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }

    await this.prisma.activity.update({
      where: { id: activityWithLoadContext.id },
      data: { sessionRpe: normalized } as Prisma.ActivityUpdateInput,
    });
    // RPE 是用户明确触发的负荷输入。近期活动每次保存都重算，亦可修复规则升级前的陈旧 PMC。
    if (
      isActivityWithinGlobalRefreshWindow(activityWithLoadContext.startTime)
    ) {
      await emitPmcInvalidate(this.events, userId);
    }

    return {
      hashId: normalizedHashId,
      activityId: activityWithLoadContext.id,
      sessionRpe: normalized,
    };
  }

  /**
   * 校验 Session RPE 值是否有效（1–10 或清除）。
   */
  private static normalizeSessionRpePayload(
    value: number | null,
  ): number | null | 'invalid' {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'invalid';
    if (value < 1 || value > 10) return 'invalid';
    return value;
  }
  /**
   * 批量删除活动
   */
  async batchDeleteActivities(
    userId: string,
    activityIds: number[],
  ): Promise<{ deleted: number }> {
    try {
      const activities = await this.prisma.activity.findMany({
        where: readyActivityWhere({ id: { in: activityIds }, userId }),
      });
      if (activities.length !== activityIds.length) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: '部分活动不存在或无权限删除',
        });
      }
      const result = await this.prisma.$transaction(async (tx) => {
        const [mappings, parquetFiles, mapThumbs] = await Promise.all([
          tx.activityThirdPartyMapping.findMany({
            where: { activityId: { in: activityIds } },
            select: { thirdPartyActivityId: true },
          }),
          this.sensorFiles.parquetFiles(tx).findMany({
            where: { activityId: { in: activityIds } },
            select: { activityId: true, parquetPath: true },
          }) as Promise<Array<{ activityId: number; parquetPath: string }>>,
          tx.activityMapThumbJob.findMany({
            where: { activityId: { in: activityIds } },
            select: { activityId: true, r2Key: true, r2DarkKey: true },
          }),
        ]);

        await this.storageGarbageCollector.enqueueObjects(
          [
            ...parquetFiles.map((file) => ({
              activityId: file.activityId,
              objectKey: file.parquetPath,
              bucket: 'default',
            })),
            ...mapThumbs.flatMap((thumb) =>
              [thumb.r2Key, thumb.r2DarkKey]
                .filter((key): key is string => Boolean(key))
                .map((objectKey) => ({
                  activityId: thumb.activityId,
                  objectKey,
                  bucket: 'public',
                })),
            ),
          ],
          'activities_batch_hard_deleted',
          undefined,
          tx,
        );

        const thirdPartyActivityIds = Array.from(
          new Set(mappings.map((mapping) => mapping.thirdPartyActivityId)),
        );
        if (thirdPartyActivityIds.length > 0) {
          await tx.thirdPartyActivity.deleteMany({
            where: { id: { in: thirdPartyActivityIds }, userId },
          });
        }
        return tx.activity.deleteMany({
          where: { id: { in: activityIds }, userId },
        });
      });

      await this.refreshUserGlobalsAfterActivityChanges(userId, activities);

      return { deleted: result.count };
    } catch (e) {
      this.logger.error(
        `[批量删除活动] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error'),
      });
    }
  }

  /**
   * 获取活动地图图层数据
   */
  async getActivitiesLayer(
    userId: string,
    filters?: {
      sportType?: string;
      startDate?: string;
      endDate?: string;
      take?: number;
      readOnly?: boolean;
    },
  ): Promise<{
    maps: Array<{
      hashId: string;
      polyline: string;
      startTime?: string;
    }>;
    bounds?: [[number, number], [number, number]];
    center?: [number, number];
  }> {
    try {
      // 构建查询条件
      const where: Prisma.ActivityWhereInput = readyActivityWhere({ userId });

      if (filters?.sportType && isSportType(filters.sportType)) {
        where.sportType = filters.sportType;
      }

      if (filters?.startDate || filters?.endDate) {
        where.startTime = {};
        if (filters.startDate) {
          // 使用 dayjs 处理日期
          where.startTime.gte = dayjs(filters.startDate).toDate();
        }
        if (filters.endDate) {
          // 使用 dayjs 处理日期
          where.startTime.lte = dayjs(filters.endDate).toDate();
        }
      }

      // 查询活动数据
      const activities = await this.prisma.activity.findMany({
        where,
        orderBy: { startTime: 'desc' },
        ...(filters?.take ? { take: filters.take } : {}),
        select: {
          hashId: true,
          elapsedTime: true,
          startTime: true,
        },
      });

      if (activities.length === 0) {
        return { maps: [] };
      }
      // 依赖单活动层生成逻辑，聚合所有活动的图层
      const results = await Promise.all(
        activities.map((a) => {
          const sampling = this.computeSamplingPercentage(a.elapsedTime ?? 0);
          return this.mapDerivation.getActivityLayerByHash(a.hashId, sampling, {
            userId,
            readOnly: filters?.readOnly,
          });
        }),
      );
      // 取出
      const startTimeByHashId = new Map<string, string | undefined>(
        activities.map((a) => [
          a.hashId,
          a.startTime ? a.startTime.toISOString() : undefined,
        ]),
      );
      const maps = results
        .flatMap((r) => r.maps)
        .map((m) => ({
          ...m,
          startTime: startTimeByHashId.get(m.hashId),
        }));
      const { bounds, center } = await this.computeBoundsAndCenter(maps);

      return { maps, bounds, center };
    } catch (e) {
      this.logger.error(
        `[获取活动图层] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 抽象：根据 polyline 列表计算边界框和中心点
   */
  async computeBoundsAndCenter(maps: Array<{ polyline: string }>): Promise<{
    bounds?: [[number, number], [number, number]];
    center?: [number, number];
  }> {
    // Mapbox polyline 解码为 [lat,lng]，但前端地图 center 需要 [lng,lat]。
    try {
      if (!maps || maps.length === 0) {
        return {};
      }

      const polyline = await import('@mapbox/polyline');
      const { getBounds } = await import('geolib');

      const coordsAll: Array<{ latitude: number; longitude: number }> = [];
      for (const m of maps) {
        const coords = polyline.decode(m.polyline); // [lat, lng][]
        for (const c of coords) {
          coordsAll.push({ latitude: c[0], longitude: c[1] });
        }
      }

      const b = getBounds(coordsAll);
      if (!b) {
        return {};
      }

      const bounds: [[number, number], [number, number]] = [
        [b.minLat, b.minLng],
        [b.maxLat, b.maxLng],
      ];
      const centerLng = (b.minLng + b.maxLng) / 2;
      const centerLat = (b.minLat + b.maxLat) / 2;
      const center: [number, number] = [centerLng, centerLat]; // [lng, lat]

      return { bounds, center };
    } catch (e) {
      this.logger.error(
        `[计算边界与中心点] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 根据总耗时动态退坡采样率：假设每秒一个点，超过 3600 秒按比例降低采样，维持约 3600 个点。
   */
  private computeSamplingPercentage(totalElapsedTimeSeconds: number): number {
    if (!totalElapsedTimeSeconds || totalElapsedTimeSeconds <= 3600) {
      return 100;
    }
    const percentage = Math.floor((3600 / totalElapsedTimeSeconds) * 100);
    // 保证在 1-100 之间
    return Math.max(1, Math.min(percentage, 100));
  }

  /**
   * 获取活动的每分钟心率功率比数据
   * @param hashId 活动hashId
   * @param userId 用户ID
   * @returns 每分钟心率功率比数据
   */
  async getHeartRatePowerRatio(
    hashId: string,
    userId?: string,
  ): Promise<
    {
      time: string;
      heartRate: number;
      power: number;
      ratio: number;
      distance: number;
    }[]
  > {
    try {
      if (!hashId) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
        });
      }
      const where: Prisma.ActivityWhereInput = readyActivityWhere({ hashId });
      if (userId) where.userId = userId;
      const activity = await this.prisma.activity.findFirst({ where });
      if (!activity) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t(
            'common.error.activity_not_found_or_no_permission',
          ),
        });
      }

      // 直接使用 SQL 层面的分钟级聚合
      const aggregatedData = await this.sensorDataService.aggregateByTimeMulti(
        [activity.id],
        ['heartRate', 'power', 'distance'],
        'second',
      );

      const normalizedData = aggregatedData.filter((data) => {
        const hr = data.heartRate;
        const power = data.power;
        return (
          hr != null &&
          !isNaN(hr) &&
          hr >= 0 &&
          power != null &&
          !isNaN(power) &&
          power >= 0
        );
      });

      if (!normalizedData || normalizedData.length === 0) {
        return [];
      }

      // 计算功率效率因子并过滤无效数据
      const result = normalizedData.map((data) => {
        const heartRate = Math.round(data.heartRate);
        const power = Math.round(data.power);
        const ratio = Number((power / heartRate).toFixed(2));
        const distance = data.distance || 0;

        return {
          time: data.time_period,
          heartRate,
          power,
          ratio,
          distance,
        };
      });

      return result;
    } catch (e) {
      this.logger.error(
        `[获取心率功率比] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * get heartRate base
   * @param activityHashId hashId
   * @param userId 用户ID
   * @returns HeartRateBaseResultDto
   */
  async getHeartRateBaseByActivityHashId(
    activityHashId: string,
    userId?: string,
  ): Promise<HeartRateBaseResultDto> {
    if (!activityHashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }
    const activity = await this.activityQuery.getActivityByHashId(
      activityHashId,
      userId,
    );

    const hrThreshold = await this.userService.getUserHeartRateThreshold(
      userId,
      activity.sportType,
      activity.startTime ?? undefined,
      activity.id,
    );
    const maxHr = hrThreshold?.maxHeartRate ?? undefined;
    const restHr = hrThreshold?.restingHeartRate ?? undefined;
    const trainingEffect = await this.prisma.activityTrainingEffect.findFirst({
      where: { activityId: activity.id },
    });
    const activityTrimp = await this.prisma.activityTrimp.findFirst({
      where: { activityId: activity.id },
    });
    const reserve = maxHr && restHr ? round(maxHr - restHr, 0) : undefined;
    // 心率强度百分比 储备心率算法
    const intensity =
      reserve > 0 && activity?.avgHeartRate && restHr
        ? (round((activity?.avgHeartRate || 0) - (restHr || 0)) / reserve) * 100
        : undefined;

    const maxPctMax =
      maxHr && activity?.maxHeartRate
        ? round(((activity?.maxHeartRate || 0) / (maxHr || 0)) * 100, 2)
        : undefined;

    const avgPctMax =
      maxHr && activity?.avgHeartRate
        ? round(((activity?.avgHeartRate || 0) / (maxHr || 0)) * 100, 2)
        : undefined;
    return {
      max: activity?.maxHeartRate || undefined,
      min: activity?.minHeartRate || undefined,
      avg: activity?.avgHeartRate || undefined,
      reserve: reserve,
      intensity: intensity ? round(intensity, 2) : undefined,
      userMaxHR: maxHr || undefined,
      avgPctMax: avgPctMax,
      maxPctMax: maxPctMax,
      calories: activity?.calories ? round(activity?.calories, 2) : undefined,
      paHr: activity?.paHr ? round(activity?.paHr, 2) : undefined,
      pwHr: activity?.pwHr ? round(activity?.pwHr, 2) : undefined,
      peakEpoc: trainingEffect?.epoc
        ? round(trainingEffect?.epoc || 0, 2)
        : undefined,
      maxHrDrop: activity?.maxHrDrop || undefined,
      // 活动心率详情展示原始 Banister TRIMP；TRIMP100 只作为统一负荷标尺，
      // 由 LoadReadoutService 以 HEART_RATE 来源对外提供。
      trimp:
        typeof activityTrimp?.trimp === 'number'
          ? round(activityTrimp.trimp, 2)
          : undefined,
    };
  }

  /**
   * 获取活动的功率基础分析数据
   * @param hashId 活动hashId
   * @param userId 用户ID
   * @returns 功率基础分析数据
   */
  async getActivityPowerBaseByHashId(
    hashId: string,
    userId?: string,
  ): Promise<PowerBasicResponse | undefined> {
    const activity = await this.activityQuery.getActivityByHashId(
      hashId,
      userId,
    );
    if (!activity) {
      return undefined;
    }

    // Fetch related power analysis data
    const activityWithPowerStats = await this.prisma.activity.findUnique({
      where: { id: activity.id },
      include: {
        coggan: true,
        bikeScore: true,
        fitnessMetricsSnapshot: true,
      },
    });

    if (!activityWithPowerStats) {
      return undefined;
    }

    const profile = await this.userService.getComposedUserProfile(
      userId,
      activity.sportType,
      activity.startTime ?? undefined,
    );

    const { coggan, bikeScore, avgPower, maxPower } = activityWithPowerStats;
    // WKG
    const WKG =
      avgPower && profile?.weight
        ? round(avgPower / profile?.weight, 2)
        : undefined;

    const aePower =
      activityWithPowerStats.aePower ??
      (avgPower &&
      activityWithPowerStats.avgHeartRate &&
      activityWithPowerStats.avgHeartRate > 0
        ? round(avgPower / activityWithPowerStats.avgHeartRate, 2)
        : undefined);
    const re = activityWithPowerStats.re ?? undefined;
    const ei = activityWithPowerStats.ei ?? undefined;

    const ftpValue =
      activityWithPowerStats.fitnessMetricsSnapshot?.ftpValue ?? profile?.ftp;
    const cpValue =
      activityWithPowerStats.fitnessMetricsSnapshot?.cpValue ?? profile?.cp;
    const ftp = ftpValue ? round(ftpValue, 0) : undefined;
    const cp = cpValue ? round(cpValue, 0) : undefined;

    const eftp = round(activityWithPowerStats.eftp, 0) || undefined;
    const ecp = round(activityWithPowerStats.ecp, 0) || undefined;

    const result: PowerBasicResponse = {
      avg: avgPower ?? undefined,
      max: maxPower ?? undefined,
      min: undefined,
      WKG: WKG ?? undefined,
      aePower: aePower ?? undefined,
      re: re ?? undefined,
      ei: ei ?? undefined,
      ftp,
      cp,
      eftp,
      ecp,
      coggan: {
        NP: coggan?.isopower ?? undefined,
        TSS: coggan?.bikeStress ?? undefined,
        IF: coggan?.intensityFactor ?? undefined,
        VI: coggan?.variabilityIndex ?? undefined,
        EF: coggan?.efficiencyFactor ?? undefined,
        TSSHOUR: coggan?.tssPerHour ?? undefined,
      },
      skiba: {
        xPower: bikeScore?.xPower ?? undefined,
        ETSS: bikeScore?.bikeScore ?? undefined,
        RI: bikeScore?.relativeIntensity ?? undefined,
        VI: bikeScore?.variabilityIndex ?? undefined,
        ATISS: bikeScore?.aerobicTISS ?? undefined,
        ANTISS: bikeScore?.anaerobicTISS ?? undefined,
      },
    };
    return result;
  }

  async getPaceBaseByActivityHashId(
    hashId: string,
    userId?: string,
  ): Promise<{
    avgPace?: number;
    avgSpeed?: number;
    avgGap?: number;
    avgAerobicEfficiency?: number;
    vo2max?: number;
  }> {
    if (!hashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }

    const where: Prisma.ActivityWhereInput = readyActivityWhere({ hashId });
    if (userId) where.userId = userId;

    const activity = await this.prisma.activity.findFirst({
      where,
      include: {
        vo2max: true,
      },
    });

    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }

    // Calculations
    const avgSpeed =
      typeof activity.avgSpeed === 'number' &&
      Number.isFinite(activity.avgSpeed)
        ? round(activity.avgSpeed, 6)
        : undefined;
    let avgGap =
      typeof activity.avgGAP === 'number' && Number.isFinite(activity.avgGAP)
        ? activity.avgGAP
        : undefined;
    if (typeof avgGap === 'number' && avgGap > 3) {
      avgGap = round((avgGap * 60) / 1000, 6);
    }
    const vo2Preference = await this.users.profiles().findUnique({
      where: { userId: activity.userId },
      select: {
        defaultVdotSource: true,
        vo2maxCorrectionFactor: true,
      },
    });
    const vo2max = resolveEffectiveActivityVo2Max(
      activity.vo2max,
      vo2Preference?.defaultVdotSource,
      vo2Preference?.vo2maxCorrectionFactor,
    )?.value;

    // Aerobic Efficiency (EF) = Speed (m/min) / AvgHR
    const avgAerobicEfficiency = activity?.avgAerobicEfficiency;

    return {
      avgSpeed,
      avgGap,
      avgAerobicEfficiency,
      vo2max,
    };
  }

  async getPaceZonesByActivityHashId(hashId: string, userId?: string) {
    if (!hashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }

    const activity = await this.activityQuery.getActivityByHashId(
      hashId,
      userId,
    );

    const zones = await this.prisma.activityZone.findMany({
      where: {
        activityId: activity.id,
        zoneType: ZoneType.PACE,
      },
      orderBy: { order: 'asc' },
      select: {
        name: true,
        order: true,
        duration: true,
        percent: true,
        min: true,
        max: true,
        avg: true,
      },
    });

    return zones.map((z, idx) => ({
      name: z.name || `z${z.order ?? idx + 1}`,
      order: z.order ?? undefined,
      duration: z.duration ?? undefined,
      percent: z.percent ?? undefined,
      min: z.min ?? undefined,
      max: z.max ?? undefined,
      avg: z.avg ?? undefined,
    }));
  }

  /**
   * get power duration cure
   * @param hashId activity HashId
   * @param userId 用户ID
   * @returns 功率持续时间曲线数据
   */
  async getActivityPowerDurationCurveByHashId(
    activityHashId: string,
    userId?: string,
  ): Promise<DurationCurve | null> {
    const activity = await this.activityQuery.getActivityByHashId(
      activityHashId,
      userId,
    );
    const profile = await this.userService.getComposedUserProfile(
      userId,
      activity.sportType,
      activity.startTime ?? undefined,
    );
    const { cp, wPrime } = profile;
    const points = await this.powerService.getPowerDurationCurveByActivityId(
      activity.id,
    );
    return {
      points: points,
      cp,
      wPrime,
    };
  }

  // /**
  //  * get power zones for activity
  //  * @param activityHashId activity hashId
  //  * @param userId 用户ID
  //  * @returns power zones
  //  */
  // async getPowerZonesByActivityHashId(
  //   activityHashId: string,
  //   userId?: string,
  // ): Promise<PowerZoneValue[]> {
  //   if (!activityHashId) {
  //     throw new BusinessException({
  //       code: BUSINESS_ERROR_CODE.COMMON,
  //       message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
  //     });
  //   }
  //   const activity = await this.getActivityByHashId(activityHashId, userId);

  //   const zones = await this.powerService.getPowerZonesForActivity(activity.id);
  //   return zones;
  // }

  /**
   * 获取用户活动统计概览
   * @param userId 用户 ID
   * @param year 过滤年份
   * @returns 活动统计概览
   * @description
   * 获取用户在指定年份内的活动统计概览，包括距离、持续时间、卡路里和活动数量
   */
  async getStatsOverview(userId: string, year?: number) {
    const where: Prisma.ActivityWhereInput = readyActivityWhere({
      userId,
      status: {
        not: ActivityStatus.FAILED,
      },
    });

    if (year) {
      const startOfYear = dayjs().year(year).startOf('year').toDate();
      const endOfYear = dayjs().year(year).endOf('year').toDate();
      where.startTime = {
        gte: startOfYear,
        lte: endOfYear,
      };
    }

    const aggregate = await this.prisma.activity.aggregate({
      _sum: {
        distance: true,
        elapsedTime: true,
        calories: true,
      },
      _count: {
        id: true,
      },
      where,
    });

    return {
      totalDistance: aggregate._sum.distance || 0,
      totalDuration: aggregate._sum.elapsedTime || 0,
      totalCalories: aggregate._sum.calories || 0,
      totalCount: aggregate._count.id || 0,
    };
  }

  /**
   *
   * @param hashId
   * @param userId
   * @returns
   */
  async isActivityAnalyzed(hashId: string, userId: string) {
    const activity = await this.activityQuery.getActivityByHashId(
      hashId,
      userId,
    );
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }

    return activity.status === ActivityStatus.FINISHED;
  }

  /**
   * 新导入架构桥接入口：
   * - 上游先把任意来源规范化为 CanonicalActivityPayload
   * - 再统一在这里转回 TrackSwap ActivityType 进入既有分析管道
   */
  async generateParquetFileByCanonicalPayload(
    activity: Activity,
    payload: CanonicalActivityPayload,
    userId?: string,
    options?: { analysisMode?: ActivityAnalyzeMode },
  ) {
    // 兼容旧分析链路：canonical payload 先转成 TrackSwap 格式，再复用现有传感器提取逻辑。
    try {
      const effectiveUserId = userId ?? activity.userId;
      if (!effectiveUserId) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('error.common.internal_server_error', {
            lang: I18nContext.current()?.lang,
          }),
        });
      }
      // 1. 将 canonical 活动 payload 映射为 trackswap 活动
      const normalized = mapCanonicalPayloadToTrackSwapActivity(payload);
      // 2. 生成 Parquet + 传感器分析；成功后由 extractParquetAndParseSensorData 调度 polyline / 缩略图入队
      await this.extractParquetAndParseSensorData(
        activity,
        normalized,
        effectiveUserId,
        options?.analysisMode ?? ActivityAnalyzeMode.LIGHT,
      );
      return true;
    } catch (e) {
      this.logger.error(
        `通过 canonical 活动 payload 生成 parquet 文件 失败: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 为 canonical 数据集生成未登记的 Parquet 文件。
   *
   * 文件先上传到唯一对象 key，但这里不更新 ActivityParquetFile，也不执行
   * 指标写入。导入 worker 会在上传全部成功后，把这些指针与 primary source、
   * Activity 摘要和 laps 一起原子提交。
   */
  async stageParquetFilesByCanonicalPayload(
    activity: Activity,
    payload: CanonicalActivityPayload,
  ): Promise<StagedActivityParquetFile[]> {
    const normalized = mapCanonicalPayloadToTrackSwapActivity(payload);
    const stagingActivity = {
      ...activity,
      sportType: payload.summary.sportType,
      startTime: payload.summary.startTime
        ? new Date(payload.summary.startTime)
        : activity.startTime,
      endTime: payload.summary.endTime
        ? new Date(payload.summary.endTime)
        : activity.endTime,
      timezone: payload.summary.timezone ?? activity.timezone,
    } as Activity;

    let sensorRecords = await this.extractSensorRecordFromSingleActivityData(
      normalized,
      stagingActivity,
    );
    let sensorLengths: SensorLength[] = [];
    if (stagingActivity.sportType === SportType.SWIM) {
      sensorLengths =
        this.extractSensorLengthFromSingleActivityData(normalized);
      if (sensorLengths.length > 0) {
        sensorRecords = this.mergeSensorLengthsToRecords(
          sensorRecords,
          sensorLengths,
        );
      }
    }

    const staged: StagedActivityParquetFile[] = [];
    try {
      if (sensorRecords.length > 0) {
        staged.push(
          await this.sensorDataService.stageSensorData(
            stagingActivity,
            sensorRecords,
          ),
        );
      }
      if (
        stagingActivity.sportType === SportType.SWIM &&
        sensorLengths.length > 0
      ) {
        staged.push(
          await this.sensorDataService.stageSensorLength(
            stagingActivity,
            sensorLengths,
          ),
        );
      }
      return staged;
    } catch (error) {
      await this.sensorDataService
        .enqueueParquetGarbage(staged, 'canonical_staging_failed')
        .catch(() => undefined);
      throw error;
    }
  }

  async retireStagedParquetFiles(
    files: readonly StagedActivityParquetFile[],
    reason: string,
  ): Promise<void> {
    await this.sensorDataService.enqueueParquetGarbage(files, reason);
  }

  /**
   * 获取游泳运动的详情
   * @param activityHashId Activity Hash ID
   * @param userId User ID
   * @returns Swim review result
   */
  async getSwimOverviewByHashId(
    activityHashId: string,
    userId: string,
  ): Promise<SwimReviewResult> {
    const activity = await this.activityQuery.getActivityByHashId(
      activityHashId,
      userId,
    );

    const sensorLength =
      await this.sensorDataService.getSensorLengthByActivityId(activity.id);

    if (!sensorLength || sensorLength.length === 0) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.activity.no_sensor_length_data'),
      });
    }

    // 计算每条 length 的持续时间（使用累计 elapsedTime 的差值）和距离（使用泳池长度）
    const poolLengthValue = activity.poolLength ?? 0;
    let totalElapsedTime = 0;
    const lengths = sensorLength.map((row, idx) => {
      totalElapsedTime += row.totalElapsedTime ?? 0;
      return {
        timestamp: dayjs(row.timestamp).toDate(),
        messageIndex: row.messageIndex ?? null,
        startTime: row.startTime ? dayjs(row.startTime).toDate() : null,
        index: (row.index ?? idx) as number,
        duration: row.totalElapsedTime,
        elapsedTime: totalElapsedTime,
        distance: poolLengthValue,
        totalStrokes: row.totalStrokes ?? 0,
        speed: row.avgSpeed ?? 0,
        swimStroke: row.swimStroke ?? '',
        avgSwimmingCadence: row.avgSwimmingCadence ?? 0,
        strokeCount: row.strokeCount ?? 0,
      };
    });

    const result: SwimReviewResult = {
      poolLength: activity.poolLength ?? undefined,
      poolLengthUnit: activity.poolLengthUnit ?? undefined,
      lengths,
    };

    return result;
  }

  /**
   * 从 activity data 中提取 sensor records 和 sensor lengths
   */
  private async extractSensorDataFromSubActivity(
    activity: Activity,
    activityFile: ActivityType,
  ): Promise<{
    sensorRecords: SensorRecord[];
    sensorLengths: SensorLength[];
  }> {
    try {
      // 1. 提取 sensor records
      let sensorRecords = await this.extractSensorRecordFromSingleActivityData(
        activityFile,
        activity,
      );
      // 2. 提取 sensor lengths
      let sensorLengths: SensorLength[] = [];
      // 如果是游泳的话，还需要提取 lengths
      if (activity.sportType === SportType.SWIM) {
        sensorLengths =
          this.extractSensorLengthFromSingleActivityData(activityFile);
      }
      // 3. 将 lengths 数据插入 sensor records 中
      if (activity.sportType === SportType.SWIM && sensorLengths.length > 0) {
        sensorRecords = this.mergeSensorLengthsToRecords(
          sensorRecords,
          sensorLengths,
        );
      }
      // 存储 records 和 lengths 数据
      await this.persistExtractedSensorData(
        activity,
        sensorRecords,
        sensorLengths,
      );

      return {
        sensorRecords,
        sensorLengths,
      };
    } catch (e) {
      this.logger.error(
        `[extractSensorDataFromSubActivity] 提取失败: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * Map TrackSwap lap to Prisma ActivityLap input
   */
  private mapTrackSwapLapToPrismaInput(
    lap: ActivityLapType,
    index: number,
    activity: Activity,
  ): Prisma.ActivityLapCreateManyInput {
    return {
      activityId: activity.id,
      index: lap.index ?? index,
      sportType: activity?.sportType,
      startLat: lap?.startPositionLat,
      startLng: lap?.startPositionLong,
      endLat: lap?.endPositionLat,
      endLng: lap?.endPositionLong,
      timestamp: lap.timestamp ? dayjs(lap.timestamp).toDate() : undefined,
      startTime: lap.startTime ? dayjs(lap.startTime).toDate() : undefined,
      endTime: lap.endTime
        ? dayjs(lap.endTime).toDate()
        : lap.timestamp
          ? dayjs(lap.timestamp).toDate()
          : undefined,
      timerTime: lap.totalTimerTime,
      elapsedTime: lap.totalElapsedTime,
      distance: lap.totalDistance,
      ascent: lap.totalAscent,
      descent: lap.totalDescent,
      // enhancedTotalAscent: lap?.totalFractionalAscent,
      // enhancedTotalDescent: lap.enhancedTotalDescent,
      maxSpeed: lap.enhancedMaxSpeed ?? lap.maxSpeed,
      avgSpeed: lap.enhancedAvgSpeed ?? lap.avgSpeed,
      avgPower: lap.avgPower,
      maxPower: lap.maxPower,
      normalizedPower: lap.normalizedPower,
      avgCadence: lap.avgCadence,
      maxCadence: lap.maxCadence,
      avgHeartRate: lap.avgHeartRate,
      maxHeartRate: lap.maxHeartRate,
      calories: lap.totalCalories,
      avgTemperature: lap.avgTemperature,
      maxTemperature: lap.maxTemperature,
      // Running Dynamics
      avgGradeAdjustedSpeed: lap?.avgGrade, // need to check if trackswap provides this or we need to calculate
      avgGroundContactTime: lap.avgStanceTime,
      avgStrideLength: lap.avgStepLength,
      avgVerticalOscillation: lap.avgVerticalOscillation,
      avgVerticalRatio: lap.avgVerticalRatio,
    } as unknown as Prisma.ActivityLapCreateManyInput;
  }

  /**
   * save activity laps to database
   * @param activity Activity
   * @param laps TrackSwap ActivityLapType[]
   */
  private async saveActivityLaps(
    activity: Activity,
    laps: ActivityLapType[],
  ): Promise<void> {
    if (!laps || laps.length === 0) return;

    try {
      const lapData: Prisma.ActivityLapCreateManyInput[] = laps.map(
        (lap, index) => this.mapTrackSwapLapToPrismaInput(lap, index, activity),
      );

      // Remove existing laps
      await this.prisma.activityLap.deleteMany({
        where: { activityId: activity.id },
      });

      // Create new laps
      // Note: using createMany might be efficient
      await this.prisma.activityLap.createMany({
        data: lapData,
      });

      this.logger.log(
        `[保存活动圈段] 已保存 ${lapData.length} 条圈段，活动ID=${activity.id}`,
      );
    } catch (e) {
      this.logger.error(
        `[保存活动圈段] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 将提取的传感器数据（记录和游程长度）持久化到Parquet存储中
   */
  private async persistExtractedSensorData(
    activity: Activity,
    sensorRecords: SensorRecord[],
    sensorLengths: SensorLength[],
  ): Promise<void> {
    // 原始记录和游泳 length 分开存储，非游泳活动不会写 length parquet。
    // save sensorRecords to Parquet
    if (sensorRecords?.length > 0) {
      this.logger.log(
        `提取 ${sensorRecords.length} 条传感器记录，来自活动 ${activity.id}，准备保存到 Parquet`,
      );

      await this.sensorDataService.storeSensorData(activity, sensorRecords);
    }

    // save swim length messages to Parquet (only for SWIM)
    if (activity.sportType === SportType.SWIM && sensorLengths?.length > 0) {
      this.logger.log(`提取 ${sensorLengths.length} 条游泳长度数据`);
      await this.sensorDataService.storeSensorLength(activity, sensorLengths);
    }
  }

  /**
   * Compute and save derived metrics (Effective Distance, etc.)
   * These are small calculations that don't fit into major analysis categories
   */
  async computeAndSaveDerivedMetrics(activity?: Activity) {
    // 轻量衍生指标在主分析之外保存，失败只记录日志，不阻断导入/重算流程。
    if (!activity) return;

    try {
      const { effectiveDistance } = this.algorithmService.computeDerivedMetrics(
        {
          distance: activity.distance ?? 0,
          ascent: activity.ascent ?? 0,
          descent: activity.descent ?? 0,
        },
      );

      // Calculate average Left/Right Balance
      const avgLeftRightBalance =
        await this.sensorDataService.getAvgLeftRightBalance(
          activity.id,
          activity.sportType || undefined,
        );

      await this.prisma.activity.update({
        where: { id: activity.id },
        data: {
          effectiveDistance,
          avgLeftRightBalance,
        },
      });

      this.logger.log(
        `[保存衍生指标] 已完成，活动ID=${activity.id}，左右平衡=${avgLeftRightBalance}`,
      );
    } catch (e) {
      this.logger.error(
        `[保存衍生指标] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * 计算卡路里 and Fat Calories
   */
  async computeAndSaveCalories(
    activity: Activity,
    userId?: string,
  ): Promise<void> {
    // 卡路里可由功率或心率+用户资料估算；两类输入都缺失时直接跳过。
    if (!activity || !userId) return;

    const durationSec = (activity.timerTime as number) || 0;

    // 1. Fetch User Metrics
    const userProfile = await this.userService.getComposedUserProfile(
      userId,
      activity.sportType || undefined,
      activity.startTime ?? undefined,
    );

    // 2. Pre-check: If no power and missing user metrics for HR calc, return early
    const hasPower = activity.avgPower && activity.avgPower > 0;
    const hasHrMetrics =
      userProfile.weight && userProfile.age && userProfile.gender;

    if (!hasPower && !hasHrMetrics) {
      return;
    }

    // 3. Calculate (pass raw values, no defaults)
    const { calories, fatCalories } = this.algorithmService.calculateCalories(
      activity.avgPower,
      activity.avgHeartRate,
      durationSec,
      {
        weight: userProfile.weight,
        age: userProfile.age,
        gender: userProfile.gender as Gender,
        maxHeartRate: userProfile.maxHeartRate,
      },
    );

    // 3. Update if calculated
    if (calories > 0) {
      await this.prisma.activity.update({
        where: { id: activity.id },
        data: {
          calories,
          fatCalories,
        },
      });
    }
  }

  /**
   * 仅跑第一段轻量指标（不依赖用户阈值）。
   */
  async runLightMetricsPipeline(
    activityId: number,
    userId: string,
  ): Promise<void> {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity || !userId) return;
    await this.metricsPipeline.runByMode({
      activity,
      userId,
      mode: ActivityAnalyzeMode.LIGHT,
    });
  }

  /**
   * 仅跑第二段重度指标（依赖用户阈值和 records 历史记录）。
   * @param activityId
   * @param userId
   * @returns
   */
  async runHeavyMetricsPipeline(
    activityId: number,
    userId: string,
  ): Promise<MetricsTaskOutcome[]> {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity || !userId) return [];
    return this.metricsPipeline.runHeavy(activity, userId);
  }

  async enqueueActivityAiReviewForImport(
    activityId: number,
    userId: string,
    source: string = 'import-post-process-heavy',
  ): Promise<void> {
    await this.activityAiReviewService.enqueueForActivity({
      activityId,
      userId,
      trigger: $Enums.ActivityAiReviewTrigger.IMPORT,
      metadata: { source },
    });
  }

  /**  分析 activity 分析步骤 */
  private getActivityAnalyzeMicroStages(
    mode: ActivityAnalyzeMode = ActivityAnalyzeMode.FULL,
  ): PipelineStage<ActivityAnalyzePipelineContext>[] {
    return [
      {
        name: `metricsPipeline:${mode}`,
        run: async (ctx) => {
          await this.metricsPipeline.runByMode({
            activity: ctx.activity,
            userId: ctx.userId,
            mode,
          });
        },
      },
    ];
  }

  /**
   * 共享核心流程：分析一项活动的能量和心率
   * 将结果持久化到Activity/PowerZone/HeartRateZone，并更新状态。 用于初始提取流和重新计算流
   */
  private async analyzeAndPersistCore(
    activity: Activity,
    userId?: string,
    mode: ActivityAnalyzeMode = ActivityAnalyzeMode.LIGHT,
  ): Promise<void> {
    // 设置 activity 状态为 PARSING，防止并发分析
    await this.setActivityStatus(activity.id, $Enums.ActivityStatus.PARSING);

    try {
      const context: ActivityAnalyzePipelineContext = { activity, userId };
      // 执行 子管道，根据 sensor records 来分析 activity 活动
      await runPipeline(
        context,
        this.getActivityAnalyzeMicroStages(mode),
        this.logger,
      );
      await this.setActivityStatus(activity.id, $Enums.ActivityStatus.FINISHED);
      if (userId) {
        void this.planLinkMatcher
          .tryAutoLinkForActivity(activity.id)
          .catch(() => {});
      }
    } catch (e) {
      this.logger.error(
        `[analyzeAndPersistCore] 失败: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      // 设置失败状态
      await this.setActivityStatus(activity.id, $Enums.ActivityStatus.FAILED);
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 选择性重算管线：用于阈值变更等场景，重算受影响的数据模块
   * 跳过与阈值无关或代价较高的步骤（例如 MaxMeanPower、Estimated CP/FTP 等）
   */
  // private async analyzeAndPersistSelective(
  //   activity: Activity,
  //   userId?: string,
  // ): Promise<void> {
  //   await this.setActivityStatus(activity.id, $Enums.ActivityStatus.PARSING);
  //   try {
  //     this.logger.log(`开始重新计算 ${activity.id}`);
  //     await this.analyzeAndSaveHeartRate(activity, userId);
  //     await this.analyzeAndSavePower(activity, userId);
  //     await this.analyzeAndSavePace(activity, userId);
  //     await this.computeAndSaveDerivedMetrics(activity);
  //     await this.computeAndSaveCalories(activity, userId);
  //     await this.computeAndSaveTrainingEffect(activity, userId);
  //     await this.computeAndSaveVo2Max(activity, userId);
  //     await this.setActivityStatus(activity.id, $Enums.ActivityStatus.FINISHED);
  //   } catch (e) {
  //     this.logger.error(
  //       `[analyzeAndPersistSelective] failed: ${
  //         e instanceof Error ? e.message : String(e)
  //       }`,
  //     );
  //     await this.setActivityStatus(activity.id, $Enums.ActivityStatus.FAILED);
  //     if (e instanceof HttpException) {
  //       throw e;
  //     }
  //     throw new BusinessException({
  //       code: BUSINESS_ERROR_CODE.COMMON,
  //       message: this.i18n.t('error.common.internal_server_error', {
  //         lang: I18nContext.current()?.lang,
  //       }),
  //     });
  //   }
  // }
  // bindActivityFitnessMetrics 已迁移到 BindFitnessMetricsTask

  /**
   * extract sensor records from single activity data
   */
  private async extractSensorRecordFromSingleActivityData(
    activity: ActivityType,
    activityEntity: Activity,
  ): Promise<SensorRecord[]> {
    let sensorRecords: SensorRecord[] = [];

    const userId = activityEntity?.userId;
    const sportType = activityEntity?.sportType;
    try {
      // extract
      sensorRecords = this.extractSensorRecordsFromActivity(
        activity,
        activityEntity?.id,
      );
      // 根据 timesstamp 排序
      sensorRecords.sort(
        (a, b) => dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf(),
      );

      const userProfile = await this.userService.getComposedUserProfile(
        userId,
        sportType,
        activityEntity.startTime ?? undefined,
      );

      sensorRecords = this.preprocessComputedFields(sensorRecords, {
        sportType,
        sportDefinitionCode: activityEntity.sportDefinitionCode,
        userWeightKg: userProfile?.weight ?? undefined,
        userHeight: userProfile?.height ?? undefined,
        altitudeThreshold: userProfile?.altitudeThreshold ?? undefined,
      });
      return sensorRecords;
    } catch (e) {
      this.logger.error(
        `提取数据到 SensorRecord 失败: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * extract sensor records from activity data
   * @param activity ActivityType
   * @returns SensorRecord[]
   */
  private extractSensorRecordsFromActivity(
    activity: ActivityType,
    activityId?: number,
  ): SensorRecord[] {
    const sensorData: SensorRecord[] = [];
    if (activity?.laps && Array.isArray(activity.laps)) {
      for (const lap of activity?.laps) {
        if (lap?.records && Array.isArray(lap?.records)) {
          for (const point of lap.records) {
            const record: SensorRecord = this.buildSensorRecord(
              point,
              lap?.index,
              activityId,
            );
            sensorData.push(record);
          }
        }
      }
    }

    return sensorData;
  }
  /**
   * build sensorRecord by ActivityRecordType
   * @param point @type {ActivityRecordType}
   * @param lapIdx
   * @returns
   */
  private buildSensorRecord(
    record: ActivityRecordType,
    lapIdx?: number,
    activityId?: number,
  ): SensorRecord {
    return {
      activityId: activityId || 0,
      lapIndex: lapIdx,
      index: record.index,
      positionLat: record.positionLat ?? undefined,
      positionLong: record.positionLong ?? undefined,
      timestamp: record.timestamp ?? undefined,
      distance: record.distance,
      accumulatedPower: record.accumulatedPower,
      speed: record.speed,
      heartRate: record.heartRate ?? undefined,
      power: record.power || undefined,
      cadence: record.cadence || undefined,
      totalCycles: record.totalCycles ?? undefined,
      temperature: record.temperature ?? undefined,
      altitude: record.altitude ?? undefined,
      enhancedAltitude: record.enhancedAltitude ?? undefined,
      grade: optionalRecordNumber(record, 'grade'),
      stepLength: record.stepLength ?? undefined,
      hdop: record?.hdop,
      vdop: record?.vdop,
      pdop: record?.pdop,
      turn: record?.turn,
      description: record?.description,
      stanceTime: record.stanceTime ?? undefined,
      stanceTimePercent: record.stanceTimePercent ?? undefined,
      stanceTimeBalance: record.stanceTimeBalance ?? undefined,
      verticalOscillation: record.verticalOscillation ?? undefined,
      verticalRatio: record.verticalRatio ?? undefined,
    } as SensorRecord;
  }

  /**
   * get lengthMesg from single activity data
   * @param activity ActivityType
   * @returns SensorLength[]
   */
  private extractSensorLengthFromSingleActivityData(
    activity: ActivityType,
  ): SensorLength[] {
    const sensorLengths: SensorLength[] = [];
    try {
      if (activity?.laps && Array.isArray(activity.laps)) {
        for (const lap of activity?.laps) {
          if (lap?.lengths && Array.isArray(lap?.lengths)) {
            for (let i = 0; i < lap.lengths.length; i++) {
              const sensorLength = lap.lengths[i];
              // Map The ActivityRecordType field is explicitly mapped to SensorLength, ensuring that subsequent aggregations are consistent with the Parquet field
              const length: SensorLength = {
                activityId: 0, // fix: override activityId to 0, will be set in storeSensorData
                ...sensorLength,
              } as SensorLength;
              sensorLengths.push(length);
            }
          }
        }
      }
      // Sort lengths by startTime
      sensorLengths.sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        return aTime - bTime;
      });
      return sensorLengths;
    } catch (e) {
      this.logger.error(
        `[提取长度传感器数据] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }
  /**
   * 将 sensor lengths 数据填入 sensor records 中
   * 因为 sensor lengths 数据是按时间顺序排列的，所以可以直接遍历 lengths 数组，
   * 然后在 records 数组中找到对应的记录，更新 speed 和 strokeType 字段
   */
  private mergeSensorLengthsToRecords(
    records: SensorRecord[],
    lengths: SensorLength[],
  ): SensorRecord[] {
    if (!records.length || !lengths.length) {
      return records;
    }

    for (const length of lengths) {
      if (!length.startTime || !length.totalElapsedTime) {
        continue;
      }

      const startTime = dayjs(length.startTime).valueOf();
      const endTime = startTime + length.totalElapsedTime * 1000;

      // Find records within the time range
      for (const record of records) {
        const recordTime = dayjs(record.timestamp).valueOf();
        if (recordTime >= startTime && recordTime <= endTime) {
          // Update speed if available in length
          if (length.avgSpeed !== undefined && length.avgSpeed !== null) {
            record.speed = length.avgSpeed;
          }
          // Update stroke type if available
          if (length.swimStroke) {
            record.strokeType = length.swimStroke;
          }
        }
      }
    }

    return records;
  }

  /**
   * check if should recalculate field based on missing ratio
   * @param records SensorRecord[]
   * @param fieldName keyof SensorRecord
   * @param threshold number (default 0.1)
   * @returns boolean
   */
  private shouldRecalculateField(
    records: SensorRecord[],
    fieldName: keyof SensorRecord,
    threshold: number = 0.1,
  ): boolean {
    if (records.length === 0) return false;
    const missingCount = records.filter(
      (record) =>
        record[fieldName] === null ||
        record[fieldName] === undefined ||
        (typeof record[fieldName] === 'number' &&
          isNaN(record[fieldName] as number)),
    ).length;
    if (missingCount === 0) {
      return false;
    }
    const missingRatio = missingCount / records.length;
    this.logger.debug(
      `字段检查：field=${fieldName}，缺失数量=${missingCount}，总数=${records.length}，缺失比例=${missingRatio}`,
    );
    return missingRatio > threshold;
  }

  private applyElevationSmoothingAndGrade(
    records: SensorRecord[],
    sportType?: SportType,
  ): SensorRecord[] {
    if (!records || records.length < 2) return records;
    const hasAltitude = records.some(
      (r) => r.enhancedAltitude != null || r.altitude != null,
    );
    if (!hasAltitude) return records;
    const lookaheadMeters =
      sportType === SportType.RUN
        ? RUN_GRADE_LOOKAHEAD_METERS
        : sportType === SportType.CYCLING
          ? CYCLING_GRADE_LOOKAHEAD_METERS
          : ELEVATE_GRADE_DEFAULT_LOOKAHEAD_METERS;
    return applySmoothing(records, lookaheadMeters);
  }

  /**
   * preprocess computed fields
   */
  private preprocessComputedFields(
    records: SensorRecord[],
    options: PreprocessComputedFieldsOptions = {},
  ): SensorRecord[] {
    const {
      sportType,
      sportDefinitionCode,
      userWeightKg,
      userHeight,
      altitudeThreshold,
    } = options;
    try {
      if (records.length === 0) return [];

      this.logger.debug('检查并补算缺失的距离数据...');
      if (this.shouldRecalculateField(records, 'distance')) {
        this.calculateDistanceIfMissing(records);
      }
      this.logger.debug('检查并补算缺失的速度数据...');
      if (this.shouldRecalculateField(records, 'speed')) {
        this.calculateSpeedIfMissing(records);
      }
      records = sanitizeActivityRecordSpeeds(records, sportType);
      // 按 Elevate 链路平滑海拔并重算 grade；跑步/骑行使用运动专项距离窗口。
      records = this.applyElevationSmoothingAndGrade(records, sportType);
      this.logger.debug('检查并补算缺失的坡度配速数据...');
      if (
        sportType === SportType.RUN &&
        this.shouldRecalculateField(records, 'gap')
      ) {
        this.calculateGapIfMissing(records);
      }
      records = this.calculateClimbAndDescend(records, altitudeThreshold);

      // power 是传感器事实字段。缺失时必须保留为空，不能把速度模型的
      // 估算值写回 power，否则会污染 MMP、CP/FTP、xPower 和 BikeScore。
      // calculatedPower 使用独立列，只在缺少可靠实测功率的跑步/骑行中生成。
      const calculationSport =
        sportDefinitionCode === 'WALKING' || sportDefinitionCode === 'HIKING'
          ? undefined
          : sportType;
      const calculatedPower = estimateCalculatedPower({
        records,
        sportType: calculationSport,
        weightKg: userWeightKg,
        height: userHeight,
        measuredPowerCoverage: measuredPowerCoverage(records),
      });
      records = records.map((record, index) => ({
        ...record,
        calculatedPower:
          calculatedPower &&
          typeof calculatedPower[index] === 'number' &&
          Number.isFinite(calculatedPower[index]) &&
          calculatedPower[index] >= 0
            ? calculatedPower[index]
            : undefined,
      }));
      this.calculateAerobicEfficiencyIfMissing(records);

      return records;
    } catch (e) {
      this.logger.error(
        `[预处理计算字段] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * calculate gap field (grade adjusted pace) s/m
   */
  private calculateGapIfMissing(records: SensorRecord[]): void {
    try {
      for (const record of records) {
        if (
          typeof record.gap === 'number' &&
          Number.isFinite(record.gap) &&
          record.gap > 0
        ) {
          continue;
        }
        const speed = record.speed ?? 0;
        const gradePercent = record.grade ?? 0;
        const gapPace = computeGapPaceSecondsPerMeter(speed, gradePercent);
        record.gap = gapPace == null ? undefined : round(gapPace, 6);
      }
    } catch (e) {
      this.logger.error(
        `[计算 GAP] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  private calculateAerobicEfficiencyIfMissing(records: SensorRecord[]): void {
    try {
      for (const record of records) {
        const hr = record.heartRate ?? 0;
        const speed = record.speed ?? 0;
        const power = record.power ?? 0;

        record.aePace = hr > 0 && speed > 0 ? round((47 * speed) / hr, 4) : 0;
        record.aePower = hr > 0 && power > 0 ? round(power / hr, 4) : 0;
      }
    } catch (e) {
      this.logger.error(
        `[计算有氧效率] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 计算 distance 字段
   */
  private calculateDistanceIfMissing(records: SensorRecord[]): void {
    try {
      if (records.length === 0) return;
      this.logger.debug('开始补算缺失的距离数据...');
      let cumulativeDistance = 0;

      for (let i = 0; i < records.length; i++) {
        const record = records[i];

        if (i === 0) {
          record.distance = 0;
          continue;
        }

        const prev = records[i - 1];

        // use gpx data to calculate distance
        if (
          prev.positionLat != null &&
          prev.positionLong != null &&
          record.positionLat != null &&
          record.positionLong != null
        ) {
          // use geolib calculate distance
          const distance = this.calculateDistance(
            prev.positionLat,
            prev.positionLong,
            record.positionLat,
            record.positionLong,
          );
          cumulativeDistance += distance;
          record.distance = cumulativeDistance;
        } else {
          // if no gpx data, use previous distance
          record.distance = prev.distance || 0;
        }
      }

      this.logger.log(
        `距离补算完成，总距离=${cumulativeDistance.toFixed(2)} 米`,
      );
    } catch (e) {
      this.logger.error(
        `[补算距离] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * use geolib calculate distance between two points (meter)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    return getPreciseDistance(
      { latitude: lat1, longitude: lon1 },
      { latitude: lat2, longitude: lon2 },
    );
  }

  /**
   * calculate missing speed field
   */
  private calculateSpeedIfMissing(records: SensorRecord[]): void {
    try {
      for (let i = 1; i < records.length; i++) {
        const prev = records[i - 1];
        const curr = records[i];
        if (
          prev.timestamp &&
          curr.timestamp &&
          prev.distance != null &&
          curr.distance != null
        ) {
          const prevTime = dayjs(prev.timestamp).valueOf();
          const currTime = dayjs(curr.timestamp).valueOf();
          const timeDiff = (currTime - prevTime) / 1000; // 秒
          const distanceDiff = curr.distance - prev.distance; // 米
          if (timeDiff > 0 && distanceDiff >= 0) {
            curr.speed = round(distanceDiff / timeDiff, 6); // 米/秒
          } else {
            curr.speed = 0;
          }
        } else {
          curr.speed = 0;
        }
      }

      // set first speed to second speed if missing
      if (records.length > 1 && records[1].speed != null) {
        records[0].speed = records[1].speed;
      }
    } catch (e) {
      this.logger.error(
        `[补算速度] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * calculate climb and descend data (based on original and enhanced altitude data)
   */
  private calculateClimbAndDescend(
    records: SensorRecord[],
    threshold?: number,
  ): SensorRecord[] {
    try {
      this.logger.log('开始计算爬升、下降与坡度字段...');
      const needUpdateClimb = this.shouldRecalculateField(records, 'climb');
      const needUpdateDescend = this.shouldRecalculateField(records, 'descend');
      const safeThreshold = Math.max(0, threshold || 0);
      const forceUpdate = safeThreshold > 0;

      // Only run if needed or if threshold algorithm is requested
      if (needUpdateClimb || needUpdateDescend || forceUpdate) {
        for (let i = 0; i < records.length; i++) {
          const curr = records[i];
          const prev = i > 0 ? records[i - 1] : null;

          // Reset fields first
          curr.climb = 0;
          curr.descend = 0;
          curr.enhancedClimb = 0;
          curr.enhancedDescend = 0;

          if (!prev) continue;

          const distDelta = (curr.distance || 0) - (prev.distance || 0);

          if (distDelta <= 0) continue;

          const altCurr = curr.altitude;
          const altPrev = prev.altitude;
          if (
            typeof altCurr === 'number' &&
            Number.isFinite(altCurr) &&
            typeof altPrev === 'number' &&
            Number.isFinite(altPrev)
          ) {
            let diff = altCurr - altPrev;
            if (forceUpdate && Math.abs(diff) < safeThreshold) diff = 0;
            if (diff > 0) {
              curr.climb = round(diff, 2);
            } else if (diff < 0) {
              curr.descend = round(-diff, 2);
            }
          }

          const enhancedAltCurr = curr.enhancedAltitude;
          const enhancedAltPrev = prev.enhancedAltitude;
          if (
            typeof enhancedAltCurr === 'number' &&
            Number.isFinite(enhancedAltCurr) &&
            typeof enhancedAltPrev === 'number' &&
            Number.isFinite(enhancedAltPrev)
          ) {
            let diff = enhancedAltCurr - enhancedAltPrev;
            if (forceUpdate && Math.abs(diff) < safeThreshold) diff = 0;
            if (diff > 0) {
              curr.enhancedClimb = round(diff, 2);
            } else if (diff < 0) {
              curr.enhancedDescend = round(-diff, 2);
            }
          }
        }
      }

      return records;
    } catch (e) {
      this.logger.error(
        `[计算爬升下降] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * batch set activity sport type
   * @param activities activity items, each item contains hashId and sportType
   * @returns 更新结果
   */
  async setActivitiesSportType(
    activities: ActivitySportTypeItem[],
    enableSmartInfer: boolean = true,
    userId?: string,
  ): Promise<boolean> {
    try {
      this.logger.log(`开始批量设置运动类型，活动数=${activities.length}`);

      let totalUpdated = 0;

      for (const activity of activities) {
        let finalSportType = activity.sportType;

        // if sport type is unknown, try to infer
        if (
          activity.sportType === $Enums.SportType.UNKNOWN &&
          enableSmartInfer
        ) {
          try {
            const inferredType = await this.inferSportTypeByHashId(
              activity.hashId,
            );
            if (inferredType !== $Enums.SportType.UNKNOWN) {
              finalSportType = inferredType;
              this.logger.log(
                `活动 ${activity.hashId} 智能识别运动类型为：${inferredType}`,
              );
            }
          } catch (e) {
            this.logger.warn(
              `[批量设置运动类型] 智能识别失败，哈希ID=${activity.hashId}：${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
        }
        const ownedActivity = await this.prisma.activity.findFirst({
          where: {
            hashId: activity.hashId,
            userId,
            state: 1,
          },
          select: { id: true },
        });
        if (!ownedActivity) continue;
        const result = await this.prisma.activity.updateMany({
          where: { id: ownedActivity.id, userId },
          data: {
            sportType: finalSportType,
            sportDefinitionCode:
              activity.subSportType ??
              activity.sportDefinitionCode ??
              defaultSportDefinitionCode(finalSportType),
            subSport: null,
          },
        });
        if (result.count > 0) {
          await this.activityWeather
            .schedule({
              activityId: ownedActivity.id,
              userId,
              force: true,
            })
            .catch(() => {
              this.logger.warn(
                `[活动天气排队] 失败 activityId=${ownedActivity.id} code=SPORT_CHANGE_SCHEDULE_FAILED`,
              );
            });
        }
        if (activity.sportType !== $Enums.SportType.UNKNOWN) {
          // if sport type is changed, need to recompute metrics
          this.recomputeActivityMetrics(activity.hashId, userId).catch((e) => {
            this.logger.error(
              `[批量设置运动类型] 触发指标复算失败，哈希ID=${
                activity.hashId
              }: ${e instanceof Error ? e.message : String(e)}`,
            );
          });
        }

        totalUpdated += result.count;
        this.logger.log(
          `活动 ${activity.hashId} 已设置为 ${finalSportType}，更新记录数=${result.count}`,
        );
      }

      this.logger.log(`批量设置运动类型完成，总更新记录数=${totalUpdated}`);
      return true;
    } catch (e) {
      this.logger.error(
        `[批量设置运动类型] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * infer sport type by activity hashId
   * @param hashId activity hashId
   * @returns inferred sport type
   */
  private async inferSportTypeByHashId(
    hashId: string,
  ): Promise<$Enums.SportType> {
    try {
      const activity = await this.prisma.activity.findFirst({
        where: { hashId, state: 1 },
        select: {
          fileName: true,
          thirdPartyProvider: true,
          thirdPartyActivityId: true,
          avgSpeed: true,
          maxSpeed: true,
          avgHeartRate: true,
          maxHeartRate: true,
          avgPower: true,
          maxPower: true,
          avgCadence: true,
          maxCadence: true,
          distance: true,
          ascent: true,
        },
      });

      if (!activity) {
        return $Enums.SportType.UNKNOWN;
      }

      const metricsInferred = this.inferSportTypeFromMetrics(activity);
      if (metricsInferred !== $Enums.SportType.UNKNOWN) {
        return metricsInferred;
      }

      return $Enums.SportType.UNKNOWN;
    } catch (e) {
      this.logger.error(
        `[按 hashId 推断运动类型] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 由于运动类型改变，所以重新计算
   * @param hashId
   * @returns
   */
  private async recomputeActivityMetrics(hashId: string, userId?: string) {
    if (!hashId || !userId) {
      this.logger.error(
        `[复算活动指标] 参数缺失：哈希ID=${hashId}，用户ID=${userId}`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'hashId and userId are required',
      });
    }
    const entity = await this.prisma.activity.findFirst({
      where: {
        hashId,
        state: 1,
      },
    });

    if (!entity) {
      this.logger.error(`[复算活动指标] 活动不存在：哈希ID=${hashId}`);
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: `Activity ${hashId} not found`,
      });
    }
    try {
      await this.analyzeAndPersistCore(entity, userId);
      await this.fitnessOrchestrator.refreshUserFitnessProfile(
        userId,
        [entity.sportType],
        { includeActivityIds: [entity.id] },
      );
    } catch (e) {
      this.logger.error(
        `[复算活动指标] 活动ID=${entity.id} 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  // saveActivityPeakPerformance / saveActivityPerformanceTT / parseDurationString
  // 已迁移到 metrics/shared 的 writer services（ActivityPeakMetricWriterService / ActivityPerformanceTTWriterService）

  /**
   * infer sport type from metrics
   * @param metrics activity metrics
   * @returns inferred sport type
   */
  private inferSportTypeFromMetrics(metrics: {
    avgSpeed?: number;
    maxSpeed?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    avgPower?: number;
    maxPower?: number;
    avgCadence?: number;
    maxCadence?: number;
    totalDistance?: number;
    totalAscent?: number;
  }): $Enums.SportType {
    try {
      const {
        avgSpeed,
        maxSpeed,
        avgPower,
        avgCadence,
        totalDistance,
        totalAscent,
      } = metrics;

      // use speed to infer sport type
      if (avgSpeed && maxSpeed) {
        //
        if (avgSpeed > 15) {
          return $Enums.SportType.CYCLING;
        }

        //
        if (avgSpeed >= 6 && avgSpeed <= 20) {
          return $Enums.SportType.RUN;
        }

        //
        if (avgSpeed < 6) {
          return $Enums.SportType.RUN;
        }
      }

      // use power to infer sport type
      if (avgPower && avgPower > 0) {
        return $Enums.SportType.CYCLING;
      }

      // use cadence to infer sport type
      if (avgCadence) {
        //
        if (avgCadence >= 60 && avgCadence <= 120) {
          return $Enums.SportType.CYCLING;
        }

        //
        if (avgCadence >= 150 && avgCadence <= 200) {
          return $Enums.SportType.RUN;
        }
      }

      // use distance and ascent to infer sport type
      if (totalDistance && totalAscent) {
        const elevationRatio = totalAscent / (totalDistance / 1000);

        // if elevation ratio is high, it may be hiking or climbing
        if (elevationRatio > 50) {
          return $Enums.SportType.RUN; // 或者可以添加 HIKING 类型
        }
      }

      return $Enums.SportType.UNKNOWN;
    } catch (e) {
      this.logger.error(
        `[根据指标推断运动类型] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return $Enums.SportType.UNKNOWN;
    }
  }

  /**
   * 批量检查活动是否重复
   * @param files 活动文件
   * @param userId 用户 ID
   * @returns 检查结果
   * @description
   * 检查上传的活动文件是否包含重复的活动
   */
  async checkDuplicateActivities(
    files: Array<Express.Multer.File>,
    userId?: string,
  ): Promise<
    {
      fileName: string;
      isRepeat: boolean;
      duplicateActivities?: {
        hashId: string;
        activityName: string;
        startTime: Date;
        totalDistance?: number;
        totalElapsedTime?: number;
        sportType?: string;
      }[];
    }[]
  > {
    const results = [];

    for (const file of files) {
      try {
        const activityFile = await this.parseActivityFileWithFile(file);
        const activities = activityFile.activities || [];

        if (activities.length === 0) {
          results.push({
            fileName: file.originalname,
            isRepeat: false,
          });
          continue;
        }

        const activity = activities[0];
        const duplicates = await this.findDuplicateActivities(activity, userId);

        results.push({
          fileName: file.originalname,
          isRepeat: duplicates.length > 0,
          duplicateActivities: duplicates.length > 0 ? duplicates : undefined,
        });
      } catch (e) {
        this.logger.error(
          `[检查重复活动] 失败：文件=${file.originalname}，错误=${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        results.push({
          fileName: file.originalname,
          isRepeat: false,
        });
      }
    }

    return results;
  }

  /**
   * 检查活动是否重复（根据核心字段：开始时间、总距离、总耗时）
   * @param activity 活动数据
   * @param userId 用户 ID
   * @returns 重复活动列表
   */
  private async findDuplicateActivities(
    activity: ActivityType,
    userId?: string,
  ): Promise<
    {
      hashId: string;
      activityName: string;
      startTime: Date;
      totalDistance?: number;
      totalElapsedTime?: number;
      sportType?: string;
    }[]
  > {
    return this.findDuplicateActivitiesCore(
      {
        startTime: activity.startTime,
        totalDistance: activity.totalDistance,
        totalElapsedTime: activity.totalElapsedTime,
      },
      userId,
    );
  }

  /**
   * 检查活动是否重复（根据核心字段：开始时间、总距离、总耗时）
   * 此方法为公共方法，可被外部同步适配器调用
   */
  async findDuplicateActivitiesByCoreFields(
    params: {
      startTime: Date;
      totalDistance?: number;
      totalElapsedTime?: number;
    },
    userId?: string,
  ): Promise<
    {
      hashId: string;
      activityName: string;
      startTime: Date;
      totalDistance?: number;
      totalElapsedTime?: number;
      sportType?: string;
    }[]
  > {
    return this.findDuplicateActivitiesCore(params, userId);
  }

  /**
   * 检查活动是否重复（根据核心字段：开始时间、总距离、总耗时）
   */
  private async findDuplicateActivitiesCore(
    params: {
      startTime: Date | undefined;
      totalDistance?: number;
      totalElapsedTime?: number;
    },
    userId?: string,
  ): Promise<
    {
      hashId: string;
      activityName: string;
      startTime: Date;
      totalDistance?: number;
      totalElapsedTime?: number;
      sportType?: string;
    }[]
  > {
    try {
      if (!params.startTime) {
        return [];
      }

      const startTime = dayjs(params.startTime).toDate();

      // Unified time buffer: 30 minutes
      const timeBuffer = 30 * 60 * 1000;
      const startTimeMin = new Date(startTime.getTime() - timeBuffer);
      const startTimeMax = new Date(startTime.getTime() + timeBuffer);

      const where: Prisma.ActivityWhereInput = {
        startTime: {
          gte: startTimeMin,
          lte: startTimeMax,
        },
        state: 1,
      };

      if (userId) {
        where.userId = userId;
      }

      const potentialDuplicates = await this.prisma.activity.findMany({
        where,
        select: {
          hashId: true,
          activityName: true,
          startTime: true,
          distance: true,
          elapsedTime: true,
          sportType: true,
        },
      });

      const duplicates = potentialDuplicates.filter((existing) => {
        // Distance tolerance: 10% or 300 meters
        if (params.totalDistance && existing.distance) {
          const distanceDiff = Math.abs(
            params.totalDistance - existing.distance,
          );
          const distanceThreshold = Math.max(existing.distance * 0.1, 300);
          if (distanceDiff > distanceThreshold) {
            return false;
          }
        }

        // Duration tolerance: 10% or 180 seconds
        if (params.totalElapsedTime && existing.elapsedTime) {
          const timeDiff = Math.abs(
            params.totalElapsedTime - existing.elapsedTime,
          );
          const timeThreshold = Math.max(existing.elapsedTime * 0.1, 180);
          if (timeDiff > timeThreshold) {
            return false;
          }
        }

        return true;
      });

      return duplicates.map((d) => ({
        hashId: d.hashId,
        activityName: d.activityName,
        startTime: d.startTime,
        totalDistance: d.distance,
        totalElapsedTime: d.elapsedTime,
        sportType: d.sportType,
      }));
    } catch (e) {
      this.logger.error(
        `[按核心字段查重] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
      if (e instanceof HttpException) {
        throw e;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  // ===========================================================================
  // Analysis Helpers
  // ===========================================================================

  private async setActivityStatus(
    activityId: number,
    status: $Enums.ActivityStatus,
  ) {
    await this.prisma.activity.update({
      where: { id: activityId },
      data: { status },
    });
  }

  // computeAndSaveMaxMeanPower 已迁移到 MaxMeanPowerTask

  /**
   * 根据 最新的 MMP 重新计算 动态 FTP 和 CP
   * 1. 获取活动的开始时间
   * 2. 根据活动的开始时间获取过去 90 天的 MMP 数据
   * 3. 根据过去 90 天的 MMP 数据来生成新的 FTP 和 CP
   * 4. 新的 FTP 和 CP 的计算时间就是活动的开始时间
   */
  // private async computeEstimatedCPAndFTP(activity?: Activity, userId?: string) {
  //   if (!activity?.sportType || !activity?.startTime || !userId) {
  //     return;
  //   }
  //   await this.analyzeService.recalculateUserCPAndFTP(
  //     userId,
  //     activity.sportType,
  //     activity.startTime,
  //   );
  // }
  /**
   * 根据本次更新重新计算 临界速度
   * @param activity
   * @param userId
   * @returns
   */
  // private async computeEstimatedCS(activity?: Activity, userId?: string) {
  //   if (!activity?.sportType || !activity?.startTime || !userId) {
  //     return;
  //   }

  //   await this.analyzeService.recalculateUserCS(
  //     userId,
  //     activity.sportType,
  //     activity.startTime,
  //   );
  // }
  /**
   * 根据单个活动的 MMP 数据来估算 (eFTP, eCP, eWPrime, ePmax)
   */
  async computeAndSaveEstimatedPowerMetricsWithSimpleActivity(
    activity: Activity,
  ) {
    try {
      // 1. 获取单个数据的 mmp 数据
      const mmpMetrics = await this.prisma.activityPeakMetric.findMany({
        where: {
          activityId: activity.id,
          type: PeakType.power,
          scaleType: ScaleType.TIME,
        },
        orderBy: {
          scaleValue: 'asc',
        },
      });
      // 2. 如果没有则跳过估算
      if (!mmpMetrics || mmpMetrics.length < 10) return;

      // 3. 构造 point
      const points = mmpMetrics
        .map((m) => ({
          duration: m.scaleValue,
          power: m.value,
        }))
        .filter((p) => p.duration > 0 && p.power > 0);

      const result = calculateCp(
        points.map(({ duration, power }) => ({
          seconds: duration,
          value: power,
        })),
      );
      if (!result.valid) return;
      // 4. Update Activity
      await this.prisma.activity.update({
        where: { id: activity.id },
        data: {
          ecp: result.cp ?? null,
          eftp: result.ftp ?? 0,
          ewPrime: result.wPrime ?? null,
          epmax: result.pMax ?? null,
        },
      });

      this.logger.log(
        `[computeAndSaveEstimatedPowerMetricsWithSimpleActivity] 单体活动的 ecp 估算完成: eCP=${result.cp}, eFTP=${result.ftp}, eW'=${result.wPrime}, eP最大值=${result.pMax}`,
      );
    } catch (e) {
      this.logger.error(
        `[单活动估算功率指标] 失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      // Do not throw, just log
    }
  }

  // getActivityPeakMetricValue 已迁移到 preloader/任务内逻辑

  // computeAndSaveMaxMeanHeartRate 已迁移到 MaxMeanHeartRateTask
  // computeAndSaveTrainingEffect 已迁移到 TrainingEffectTask

  // analyzeAndSavePower 已迁移到 power-base / power-zones / power-coggan-bike metrics tasks
  // analyzeAndSaveHeartRate 已迁移到 heart-rate-* metrics tasks（preload/base/zones/trimp/persist）
  // analyzeAndSavePace 已迁移到 pace-base / pace-zones metrics tasks

  // computeAndSaveVo2Max* 已迁移到 Vo2MaxTask

  // /**
  //  * Update Max Heart Rate from observed max in the activity
  //  * Logic:
  //  * 1. Check if observed Max HR > Current Active Max HR
  //  * 2. Direct update if Auto-Update is ON (No EMA, No Status 2 update)
  //  */
  // private async computeAndSaveMaxHeartRateObserved(
  //   activity: Activity,
  //   userId?: string,
  // ): Promise<void> {
  //   if (!userId || !activity) return;

  //   // Only for Run/Ride
  //   if (
  //     activity.sportType !== SportType.RUN &&
  //     activity.sportType !== SportType.CYCLING
  //   ) {
  //     return;
  //   }

  //   try {
  //     // 获取最大心率
  //     const active_max_hr_metric = await this.userService.getUserFitnessMetric(
  //       userId,
  //       UserFitnessMetricType.MAX_HR,
  //       activity.startTime || undefined,
  //       activity.sportType,
  //     );

  //     // userId: string,
  //     //     type: UserFitnessMetricType,
  //     //     at?: Date,
  //     //     sportType?: SportType | null,
  //     //     source: MetricSource = MetricSource.MANUAL,
  //     const current_max_hr = active_max_hr_metric?.value || 0;
  //     // 根据 max_hr 来获取 lthr
  //     const active_lthr_metric = await this.userService.getUserFitnessMetric(
  //       userId,
  //       UserFitnessMetricType.LTHR,
  //       activity.startTime || undefined,
  //       activity.sportType,
  //       MetricSource.AUTO,
  //       true,
  //     );
  //     const estimatedFromLthr =
  //       active_lthr_metric?.value > 0
  //         ? round(active_lthr_metric?.value / 0.85)
  //         : 0;
  //     if (estimatedFromLthr > current_max_hr) {
  //       await this.userService.upsertFitnessMetric(
  //         userId,
  //         UserFitnessMetricType.MAX_HR,
  //         estimatedFromLthr,
  //         undefined,
  //         activity.sportType,
  //         MetricSource.AUTO,
  //         activity.startTime || new Date(),
  //       );
  //     }
  //   } catch (e) {
  //     this.logger.error(
  //       `[computeAndSaveMaxHeartRateObserved] failed: ${
  //         e instanceof Error ? e.message : String(e)
  //       }`,
  //     );
  //   }
  // }

  // computeAndSavePeakPace 已迁移到 PeakPaceTask

  /**
   * Get heart rate duration curve for an activity by hashId
   */
  async getActivityHeartRateDurationCurveByHashId(
    hashId: string,
    userId?: string,
  ): Promise<HeartRateDurationCurvePoint[]> {
    const activity = await this.activityQuery.getActivityByHashId(
      hashId,
      userId,
    );
    if (!activity) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_not_found', {
          args: { id: hashId },
        }),
      });
    }

    return this.heartRateService.getHeartRateDurationCurveByActivityId(
      activity.id,
    );
  }
}
