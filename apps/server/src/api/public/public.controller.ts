import {
  Body,
  Controller,
  Post,
  Res,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PublicService } from './public.service';
import { CalculateHeartRateZonesDto } from './dto/calculate-zones.dto';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ActivityService } from '../activity/activity.service';
import { EstimateCpFromFilesDto } from '../activity/dto/estimate-cp.dto';
import { ConvertFilesDto } from '../activity/dto/convert.dto';
import { FileNameEncodePipe } from '@/pipe';
import { createContentDisposition } from '@/utils/filename.util';
import {
  PUBLIC_TRACK_FILE_MAX_FILES,
  PUBLIC_TRACK_MULTI_FILE_OPTIONS,
  PUBLIC_TRACK_SINGLE_FILE_OPTIONS,
} from './public-upload-limits';
import { EncodeWorkoutDto } from './dto/encode-workout.dto';

function readNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PUBLIC_DEFAULT_TTL_MS = readNumberEnv(
  'PUBLIC_THROTTLE_DEFAULT_TTL_MS',
  60_000,
);
const PUBLIC_DEFAULT_LIMIT = readNumberEnv('PUBLIC_THROTTLE_DEFAULT_LIMIT', 10);
const PUBLIC_HEAVY_TTL_MS = readNumberEnv(
  'PUBLIC_THROTTLE_HEAVY_TTL_MS',
  60_000,
);
const PUBLIC_HEAVY_LIMIT = readNumberEnv('PUBLIC_THROTTLE_HEAVY_LIMIT', 3);

/**
 * Public API（无需登录即可访问）
 *
 * 说明：
 * - 所有接口都在 `/public/*` 下
 * - 受全局限流守卫影响（只对 `/public` 与 `/ai` 生效）
 * - 本控制器额外配置了默认限流策略；部分“重”接口会使用更严格的限流配置
 */
@Controller('public')
@Throttle({
  default: {
    ttl: PUBLIC_DEFAULT_TTL_MS,
    limit: PUBLIC_DEFAULT_LIMIT,
  },
})
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * 计算心率区间（无需登录）
   *
   * 用途：
   * - 给前端计算心率区间/展示分区提供统一逻辑
   *
   * 入参：
   * - dto: 包含最大心率、静息心率、区间模型等
   *
   * 返回：
   * - 心率区间数组（每区间的上下界等）
   */
  @Post('heart-rate/zones')
  @AllowAnonymous()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  calculateHeartRateZones(@Body() dto: CalculateHeartRateZonesDto) {
    return this.publicService.calculateHeartRateZones(dto);
  }

  /**
   * 从上传文件估算临界功率/临界配速等指标（无需登录）
   *
   * 特点：
   * - 属于“重计算/重 IO”接口，使用更严格的限流策略（heavy）
   * - multipart/form-data 上传文件（目前限制 1 个文件）
   *
   * 返回：
   * - 估算结果（由 ActivityService.estimateCpFromFiles 输出）
   */
  @Post('estimate-cp')
  @AllowAnonymous()
  @Throttle({
    default: {
      ttl: PUBLIC_HEAVY_TTL_MS,
      limit: PUBLIC_HEAVY_LIMIT,
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 1, PUBLIC_TRACK_SINGLE_FILE_OPTIONS),
  )
  async estimateCp(
    @UploadedFiles(FileNameEncodePipe) files: Array<Express.Multer.File>,
    @Body(new ValidationPipe({ transform: true })) body: EstimateCpFromFilesDto,
  ) {
    return await this.activityService.estimateCpFromFiles(files, body);
  }

  /**
   * 文件格式转换（无需登录）
   *
   * 用途：
   * - GPX/FIT/TCX 等文件互转，返回单文件或 zip
   *
   * 特点：
   * - 属于“重 IO”接口，使用更严格的限流策略（heavy）
   * - 响应通过 `Content-Disposition` 触发浏览器下载
   */
  @Post('convert')
  @AllowAnonymous()
  @Throttle({
    default: {
      ttl: PUBLIC_HEAVY_TTL_MS,
      limit: PUBLIC_HEAVY_LIMIT,
    },
  })
  @UseInterceptors(
    FilesInterceptor(
      'files',
      PUBLIC_TRACK_FILE_MAX_FILES,
      PUBLIC_TRACK_MULTI_FILE_OPTIONS,
    ),
  )
  async convertFiles(
    @UploadedFiles(FileNameEncodePipe) files: Array<Express.Multer.File>,
    @Body(new ValidationPipe({ transform: true })) body: ConvertFilesDto,
    @Res() res: Response,
  ) {
    const content = await this.activityService.convertFiles(
      files,
      body.type,
      body.sourceType,
    );
    res.setHeader(
      'Content-Type',
      content.type === 'file' ? 'application/octet-stream' : 'application/zip',
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition, X-TrackSwap-Source-Format, X-TrackSwap-Target-Format',
    );
    res.setHeader(
      'X-TrackSwap-Source-Format',
      [...new Set(content.sourceFormats)].join(','),
    );
    res.setHeader('X-TrackSwap-Target-Format', body.type);
    res.setHeader(
      'Content-Disposition',
      createContentDisposition(content.filename),
    );
    return res.send(content.content);
  }

  /** Returns a safe TrackSwap summary without exposing raw/native messages. */
  @Post('inspect-activity-file')
  @AllowAnonymous()
  @Throttle({
    default: {
      ttl: PUBLIC_HEAVY_TTL_MS,
      limit: PUBLIC_HEAVY_LIMIT,
    },
  })
  @UseInterceptors(FileInterceptor('file', PUBLIC_TRACK_SINGLE_FILE_OPTIONS))
  async inspectActivityFile(
    @UploadedFile(FileNameEncodePipe) file: Express.Multer.File,
  ) {
    return await this.publicService.inspectActivityFile(file);
  }

  /**
   * 编码 FIT Course（无需登录）
   *
   * 用途：
   * - 前端/Docs 站点的“路线转换器”调用该接口，将上传的路线文件编码为 FIT Course
   *
   * 特点：
   * - 属于“重 IO”接口，使用更严格的限流策略（heavy）
   * - 响应为 `application/octet-stream`，并通过 `Content-Disposition` 下载
   */
  @Post('encode-course')
  @AllowAnonymous()
  @Throttle({
    default: {
      ttl: PUBLIC_HEAVY_TTL_MS,
      limit: PUBLIC_HEAVY_LIMIT,
    },
  })
  @UseInterceptors(FileInterceptor('file', PUBLIC_TRACK_SINGLE_FILE_OPTIONS))
  async encodeFitCourse(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    const content = await this.publicService.encodeFITCourseFromFile(file);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader(
      'Content-Disposition',
      createContentDisposition(content.filename),
    );
    return res.send(content.content);
  }

  /**
   * 编码结构化训练 FIT（无需登录）
   *
   * 用途：
   * - Docs `/workout-editor` 将 Workout DSL 编码为 Garmin workout FIT
   * - 与登录接口 `POST /workout/build` 共用 parsePlanText + buildFITFromPlan
   *
   * 特点：
   * - 属于“重计算”接口，使用 heavy 限流
   * - 响应为 `application/octet-stream`，并通过 `Content-Disposition` 下载
   */
  @Post('encode-workout')
  @AllowAnonymous()
  @Throttle({
    default: {
      ttl: PUBLIC_HEAVY_TTL_MS,
      limit: PUBLIC_HEAVY_LIMIT,
    },
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async encodeWorkout(@Body() dto: EncodeWorkoutDto, @Res() res: Response) {
    const content = await this.publicService.encodeWorkoutFromText(dto);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader(
      'Content-Disposition',
      createContentDisposition(content.filename),
    );
    return res.send(content.content);
  }
}
