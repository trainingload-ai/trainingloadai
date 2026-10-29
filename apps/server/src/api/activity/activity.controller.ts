import {
  Controller,
  Get,
  HttpCode,
  Query,
  Param,
  UseGuards,
  Post,
  Patch,
  UploadedFiles,
  UseInterceptors,
  Body,
  Res,
  ValidationPipe,
  Req,
  Delete,
  Logger,
  Put,
  Headers,
} from '@nestjs/common';
import { CheckDuplicateActivitiesResponseDto } from './dto/check-duplicate.dto';
import { ActivityService } from './activity.service';
import { ActivityMapDerivationService } from './activity-map-derivation.service';
import { ActivityQueryService } from './activity-query.service';
import {
  ActivityImportDraftService,
  type CommitActivityImportDraftResult,
} from './activity-import-draft.service';
import { ConvertByHashDto, ConvertFilesDto } from './dto/convert.dto';
import { SetActivitiesSportTypeDto } from './dto/set-sport-type.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FileNameEncodePipe } from '@/pipe';
import dayjs = require('dayjs');
import { powerService } from '@/power/power.service';
import { HeartRateService } from '@/heart-rate/heart-rate.service';
import { PrismaService } from '@/prisma/prisma.service';
import { $Enums } from '@prisma/client';
import { PaceService } from '../pace/pace.service';
import { I18nService } from 'nestjs-i18n';
import { Log } from '@/utils/decorators/log.decorator';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { ActivityHashId } from '@/utils/decorators/activity-hash-id.decorator';
import { ExternalActivitySourceRouter, ImportBatchService } from '@/importing';
import { PlanService } from '@/api/plan/plan.service';
import { ReplaceActivityPlanLinkDto } from '@/api/plan/dto/replace-activity-plan-link.dto';
import { CommitActivityImportDraftDto } from './dto/activity-import-draft.dto';
import { UpdateActivitySessionRpeDto } from './dto/update-activity-session-rpe.dto';
import { ActivityAiReviewService } from './activity-ai-review.service';
import { createContentDisposition } from '@/utils/filename.util';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { StrengthActivityService } from './strength-activity.service';
import {
  AddActivityStrengthExerciseDto,
  CompleteActivityStrengthSetDto,
  FinishStrengthActivityDto,
  ReplaceActivityStrengthDto,
  StartStrengthActivityDto,
} from './dto/strength-activity.dto';
import { inspectTrackFile } from '@/importing/trackswap-file';
import type { TrackFileInspectionResponse } from '@shared/track-file-contract';
import type { Request, Response } from 'express';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';

const FITNESS_ACTIVITY_DEFINITION_CODES = [
  'STRENGTH_TRAINING',
  'STRETCHING',
  'HIIT',
  'YOGA',
  'ROWING',
  'ELLIPTICAL',
] as const;

@Controller('activities')
@UseGuards(OAuthHybridAuthGuard)
export class ActivityController {
  private readonly logger = new Logger(ActivityController.name);

  constructor(
    private readonly activityService: ActivityService,
    private readonly activityQuery: ActivityQueryService,
    private readonly activityMapDerivation: ActivityMapDerivationService,
    private readonly activityImportDraftService: ActivityImportDraftService,
    private readonly importBatchService: ImportBatchService,
    private readonly powerService: powerService,
    private readonly heartRateService: HeartRateService,
    private readonly paceService: PaceService,
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly planService: PlanService,
    private readonly activityAiReviewService: ActivityAiReviewService,
    private readonly strengthActivityService: StrengthActivityService,
    private readonly externalActivityRouter: ExternalActivitySourceRouter,
  ) {}

  @Post('external-mirrors/:sourceObjectId/retry')
  retryExternalActivityMirror(
    @CurrentUserId() userId: string,
    @Param('sourceObjectId') sourceObjectId: string,
  ) {
    return this.externalActivityRouter.retryMirror(userId, sourceObjectId);
  }

  @Post('strength/start')
  startStrengthActivity(
    @CurrentUserId() userId: string,
    @Body() dto: StartStrengthActivityDto,
  ) {
    return this.strengthActivityService.start(userId, dto);
  }

  @Get(':hashId/strength')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  getActivityStrength(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.strengthActivityService.get(hashId, userId);
  }

  @Put(':hashId/strength')
  replaceActivityStrength(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @Body() dto: ReplaceActivityStrengthDto,
  ) {
    return this.strengthActivityService.replace(hashId, userId, dto);
  }

  @Post(':hashId/strength/exercises')
  addActivityStrengthExercise(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @Body() dto: AddActivityStrengthExerciseDto,
  ) {
    return this.strengthActivityService.addExercise(hashId, userId, dto);
  }

  @Delete(':hashId/strength/exercises/:exerciseId')
  removeActivityStrengthExercise(
    @ActivityHashId() hashId: string,
    @Param('exerciseId') exerciseId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.strengthActivityService.removeExercise(
      hashId,
      exerciseId,
      userId,
    );
  }

  @Post(':hashId/strength/sets/:setId/complete')
  completeActivityStrengthSet(
    @ActivityHashId() hashId: string,
    @Param('setId') setId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CompleteActivityStrengthSetDto,
  ) {
    return this.strengthActivityService.completeSet(hashId, setId, userId, dto);
  }

  @Post(':hashId/strength/finish')
  finishActivityStrength(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @Body() dto: FinishStrengthActivityDto,
  ) {
    return this.strengthActivityService.finish(hashId, userId, dto);
  }

  /** 单活动 AI 复盘快照 */
  @Get(':hashId/ai-review')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivityAiReview(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @Query('lang') lang = 'en',
  ) {
    return this.activityAiReviewService.getAiReviewForActivityHash({
      userId,
      activityHashId: hashId,
      language: lang,
    });
  }

  /**
   * 获取活动的第三方映射关系
   */
  @Get(':hashId/third-party-mappings')
  @Log({ context: 'getActivityThirdPartyMappings' })
  async getActivityThirdPartyMappings(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取第三方映射：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    const activity = await this.activityQuery.getActivityByHashId(
      hashId,
      userId,
    );

    const mappings = await this.prisma.activityThirdPartyMapping.findMany({
      where: {
        activityId: activity.id,
        isActive: true,
      },
      include: {
        thirdPartyActivity: {
          select: {
            id: true,
            provider: true,
            externalId: true,
            activityName: true,
            processingStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return mappings.map((mapping) => ({
      id: mapping.id,
      activityId: mapping.activityId,
      externalId: mapping.thirdPartyActivity.externalId,
      provider: mapping.thirdPartyActivity.provider,
    }));
  }

  /**
   * 检查活动是否已分析完成
   */
  @Get(':hashId/analysis')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async checkParquetFileGenerated(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 检查分析状态：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    return await this.activityService.isActivityAnalyzed(hashId, userId);
  }

  /**
   * 获取当前活动关联的 workout 计划链接
   */
  @Get(':hashId/plan-workout/link')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivityPlanWorkoutLink(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.getActivityPlanLinkByHash(userId, hashId);
  }

  /**
   * 获取当前活动关联的 workout 计划候选列表
   */
  @Get(':hashId/plan-workout/candidates')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async listActivityPlanWorkoutCandidates(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @Query('timeZone') timeZone?: string,
  ) {
    return this.planService.listActivityPlanCandidatesByHash(
      userId,
      hashId,
      timeZone?.trim() || undefined,
    );
  }

  /**
   * 替换当前活动关联的 workout 计划链接
   */
  @Post(':hashId/plan-workout/link')
  @HttpCode(200)
  async replaceActivityPlanWorkoutLink(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @Body() dto: ReplaceActivityPlanLinkDto,
  ) {
    return this.planService.replaceActivityPlanLinkByHash(userId, hashId, dto);
  }
  /**
   * 移除当前活动关联的 workout 计划链接
   */
  @Delete(':hashId/plan-workout/link')
  async removeActivityPlanWorkoutLink(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.removeActivityPlanLinkByHash(userId, hashId);
  }
  /**
   * 更新当前活动会话 RPE
   */
  @Patch(':hashId/session-rpe')
  @HttpCode(200)
  @Log({ context: 'patchActivitySessionRpe' })
  async patchActivitySessionRpe(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateActivitySessionRpeDto,
  ) {
    return this.activityService.setActivitySessionRpeByHash(
      userId,
      hashId,
      dto.sessionRpe,
    );
  }

  /**
   * 获取用户活动列表
   *
   * 支持查询参数：
   * - page：页码（默认 1）
   * - perPage：每页数量（默认 20）
   * - sportType：运动类型筛选
   * - startDate：开始日期筛选
   * - endDate：结束日期筛选
   * - thirdPartyProvider：按当前部署启用的第三方来源筛选
   * - search：按活动名称/描述搜索
   * - orderBy：排序字段（startTime/totalDistance/totalElapsedTime/createdAt）
   * - orderDirection：排序方向（asc/desc，默认 desc）
   *
   * 示例：
   * GET /activities?page=1&perPage=20&sportType=RUN
   * GET /activities?开始日期=2024-01-01&结束日期=2024-01-31
   * GET /activities?orderBy=totalDistance&orderDirection=desc
   */
  @Get()
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivities(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('sportType') sportType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('thirdPartyProvider') thirdPartyProvider?: string,
    @Query('search') search?: string,
    @Query('minDuration') minDuration?: string,
    @Query('maxDuration') maxDuration?: string,
    @Query('minDistance') minDistance?: string,
    @Query('maxDistance') maxDistance?: string,
    @Query('orderBy') orderBy?: string,
    @Query('orderDirection') orderDirection?: string,
    /** IANA，活动列表按当地日历日解析 startTime（关联训练入口等） */
    @Query('timeZone') timeZone?: string,
  ) {
    const hasDateFilter = Boolean(startDate || endDate);

    // 构造筛选条件
    const filters = {
      sportType:
        sportType === 'all' || sportType === 'FITNESS' ? undefined : sportType,
      sportDefinitionCodes:
        sportType === 'FITNESS' ? FITNESS_ACTIVITY_DEFINITION_CODES : undefined,
      startDate: startDate
        ? dayjs(startDate).startOf('day').toDate()
        : undefined,
      endDate: endDate ? dayjs(endDate).endOf('day').toDate() : undefined,
      thirdPartyProvider,
      search,
      minDuration: minDuration ? parseInt(minDuration) : undefined,
      maxDuration: maxDuration ? parseInt(maxDuration) : undefined,
      minDistance: minDistance ? parseFloat(minDistance) : undefined,
      maxDistance: maxDistance ? parseFloat(maxDistance) : undefined,
      calendarTimeZone: timeZone?.trim() || undefined,
    };

    // Parse pagination params if provided
    let pageNum: number | undefined = undefined;
    let perPageNum: number | undefined = undefined;

    if (page && perPage) {
      pageNum = parseInt(page);
      perPageNum = parseInt(perPage);
    }

    if (!hasDateFilter) {
      if (!pageNum || !perPageNum) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.query_condition_error'),
        });
      }
      if (
        isNaN(pageNum) ||
        isNaN(perPageNum) ||
        pageNum < 1 ||
        perPageNum < 1
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.query_condition_error'),
        });
      }
    } else {
      // 如果带日期条件，则必须同时传 startDate/endDate
      if (!startDate || !endDate) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.query_condition_error'),
        });
      }
      const start = dayjs(startDate).startOf('day');
      const end = dayjs(endDate).endOf('day');
      if (end.isBefore(start)) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.query_condition_error'),
        });
      }
      const diffInMonths = end.diff(start, 'month', true);
      if (diffInMonths > 3) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.query_condition_error'),
        });
      }
    }

    const orderOptions = {
      orderBy: orderBy || 'startTime',
      orderDirection: (orderDirection as 'asc' | 'desc') || 'desc',
    };

    this.logger.debug(
      `[活动] 获取活动列表：用户ID=${userId}, 运动类型=${filters.sportType ?? 'ALL'}, 是否有日期筛选=${hasDateFilter}, 页码=${pageNum ?? 'NA'}, 每页数量=${perPageNum ?? 'NA'}`,
    );
    return await this.activityQuery.getActivities(
      userId,
      filters,
      orderOptions,
      pageNum,
      perPageNum,
      { readOnly: Boolean(publicDemo) },
    );
  }

  /**
   * 获取活动统计概览
   */
  @Get('stats/overview')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getStatsOverview(
    @CurrentUserId() userId: string,
    @Query('year') year?: number,
  ) {
    this.logger.debug(
      `[活动] 获取统计概览：用户ID=${userId}, year=${year ?? 'ALL'}`,
    );
    return await this.activityService.getStatsOverview(
      userId,
      year ? Number(year) : undefined,
    );
  }

  /** 上传前用 TrackSwap 按内容识别格式并返回安全摘要。 */
  @Post('inspect-files')
  @UseInterceptors(FilesInterceptor('files', 100))
  async inspectActivityFiles(
    @UploadedFiles(FileNameEncodePipe) files: Array<Express.Multer.File>,
  ): Promise<TrackFileInspectionResponse> {
    if (!files || files.length === 0) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UPLOAD_NO_FILE,
        message: this.i18n.t('common.error.upload_no_file'),
      });
    }

    const items: TrackFileInspectionResponse['items'] = [];
    for (const file of files) {
      try {
        const inspection = await inspectTrackFile(
          file.buffer,
          file.originalname,
        );
        const valid = (inspection.activity?.activityCount ?? 0) > 0;
        items.push({
          filename: file.originalname,
          valid,
          inspection,
          error: valid ? undefined : 'The file has no activity sessions',
        });
      } catch (error) {
        items.push({
          filename: file.originalname,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { items };
  }

  /**
   * 检查是否有重复上传的文件
   */
  @Post('check-duplicate')
  @UseInterceptors(FilesInterceptor('files', 100))
  async checkDuplicateActivities(
    @UploadedFiles(FileNameEncodePipe) files: Array<Express.Multer.File>,
    @CurrentUserId() userId: string,
  ): Promise<CheckDuplicateActivitiesResponseDto> {
    if (!files || files.length === 0) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.upload_no_file'),
      });
    }
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.USER_NOT_FOUND,
        message: this.i18n.t('common.error.current_user_not_logged_in'),
      });
    }

    this.logger.log(
      `[活动] 检查重复上传：用户ID=${userId}, 文件数=${files.length}`,
    );
    const results = await this.activityService.checkDuplicateActivities(
      files,
      userId,
    );

    return {
      results: results.map((result) => ({
        fileName: result.fileName,
        isRepeat: result.isRepeat,
        duplicateActivities: result.duplicateActivities?.map((activity) => ({
          hashId: activity.hashId,
          activityName: activity.activityName,
          startTime: activity.startTime,
          totalDistance: activity.totalDistance,
          totalElapsedTime: activity.totalElapsedTime,
          sportType: activity.sportType,
        })),
      })),
    };
  }

  /**
   * 批量上传活动并创建导入批次
   * POST /activities/upload
   */
  @Post('upload')
  @HttpCode(202)
  @UseInterceptors(FilesInterceptor('files', 100))
  async uploadActivities(
    @UploadedFiles(FileNameEncodePipe) files: Array<Express.Multer.File>,
    @CurrentUserId() userId: string,
    @Req() req?: Request,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.current_user_not_logged_in'),
      });
    }
    if (!files || files.length === 0) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UPLOAD_NO_FILE,
        message: this.i18n.t('common.error.upload_no_file'),
      });
    }
    this.logger.log(
      `[导入] 创建文件导入批次：用户ID=${userId}, 文件数=${files.length}`,
    );
    const batch = await this.importBatchService.createFileImportBatch({
      files,
      userId,
      req,
    });

    // 与 GET /activities/import/batches/:batchId 同一结构，便于前端复用 ImportBatchSummary
    return await this.importBatchService.getBatchSummary(batch.id, userId);
  }

  /**
   * 上传单个活动文件并创建保存前预览草稿。
   * 草稿不会写入正式 Activity，也不会影响 PMC/用户指标。
   * TIP: 移动端接口，给移动端用户用来预览文件内容。
   */
  @Post('drafts')
  @HttpCode(201)
  @UseInterceptors(FilesInterceptor('files', 1))
  async createActivityImportDraft(
    @UploadedFiles(FileNameEncodePipe) files: Array<Express.Multer.File>,
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Req() req?: Request,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.current_user_not_logged_in'),
      });
    }
    if (!files || files.length === 0) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UPLOAD_NO_FILE,
        message: this.i18n.t('common.error.upload_no_file'),
      });
    }
    if (files.length > 1) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.upload_single_file_only'),
      });
    }

    return this.activityImportDraftService.createFromFile({
      file: files[0]!,
      userId,
      idempotencyKey,
      req,
    });
  }

  /**
   * 获取保存前活动草稿预览。
   * @param draftId - 草稿 ID。
   * @param userId - 用户 ID。
   * @returns 活动草稿预览。
   * TIP: 移动端接口，给移动端用户用来预览文件内容。
   */
  @Get('drafts/:draftId')
  async getActivityImportDraft(
    @Param('draftId') draftId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.activityImportDraftService.getDraftPreview({
      draftId,
      userId,
    });
  }

  /**
   * 将保存前活动草稿提交为正式 Activity。
   *
   */
  @Post('drafts/:draftId/commit')
  @HttpCode(200)
  async commitActivityImportDraft(
    @Param('draftId') draftId: string,
    @CurrentUserId() userId: string,
    @Body(new ValidationPipe({ transform: true }))
    body: CommitActivityImportDraftDto,
  ): Promise<
    CommitActivityImportDraftResult & {
      linkedPlanWorkout?: Awaited<
        ReturnType<PlanService['getActivityPlanLinkByHash']>
      >['linkedPlanWorkout'];
      planLinkStatus?: 'linked' | 'failed';
    }
  > {
    const committed = await this.activityImportDraftService.commitDraft({
      draftId,
      userId,
      sessionRpe: body.sessionRpe ?? null,
    });
    if (!body.workoutId?.trim()) return committed;

    try {
      await this.planService.bindRecordedActivityToWorkout(
        userId,
        committed.activityHashId,
        body.workoutId.trim(),
      );
      const planLink = await this.planService.getActivityPlanLinkByHash(
        userId,
        committed.activityHashId,
      );
      return { ...committed, ...planLink, planLinkStatus: 'linked' };
    } catch (error) {
      // Activity/RPE 已经持久化后，关联失败不能再把整个提交响应伪装成失败；
      // 否则客户端会无限重试一个实际已经成功的保存，并把 modal 卡住。
      this.logger.warn(
        `[活动草稿] 活动已保存但计划关联失败 draft=${draftId} activity=${committed.activityHashId} workout=${body.workoutId.trim()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ...committed, planLinkStatus: 'failed' };
    }
  }
  /**
   * 批量设置活动 sportType（用于修复上传文件未识别 sportType 的情况）
   */
  @Post('set-sport-type')
  async setActivitiesSportType(
    @Body(new ValidationPipe({ transform: true }))
    body: SetActivitiesSportTypeDto,
    @CurrentUserId() userId: string,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.current_user_not_logged_in'),
      });
    }
    const { activities, enableSmartInfer = true } = body;
    this.logger.log(
      `[活动] 批量设置运动类型：用户ID=${userId}, 数量=${activities?.length ?? 0}, enableSmartInfer=${enableSmartInfer}`,
    );
    return await this.activityService.setActivitiesSportType(
      activities,
      enableSmartInfer,
      userId,
    );
  }
  /**
   * 删除单条活动
   */
  @Delete(':hashId')
  async deleteActivity(
    @CurrentUserId() userId: string,
    @ActivityHashId() hashId: string,
  ) {
    this.logger.log(`[活动] 删除活动：用户ID=${userId}, 哈希ID=${hashId}`);
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.current_user_not_logged_in'),
      });
    }
    if (!hashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }
    return await this.activityService.deleteActivity(userId, hashId);
  }
  /**
   * 转换文件：上传原始文件后，返回转换结果（单文件或 zip）
   */
  @Post('convert')
  @UseInterceptors(FilesInterceptor('files'))
  async convertFiles(
    @UploadedFiles(FileNameEncodePipe) files: Array<Express.Multer.File>,
    @Body(new ValidationPipe({ transform: true })) body: ConvertFilesDto,
    @Res() res: Response,
  ) {
    this.logger.log(
      `[活动] 转换文件：类型=${body.type}, 文件数=${files?.length ?? 0}`,
    );
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

  /**
   * 转换已上传活动：基于活动 hashId 返回目标格式文件
   */
  @Post('convert/byId')
  async convertActivityByHashId(
    @Body(new ValidationPipe({ transform: true })) body: ConvertByHashDto,
    @CurrentUserId() userId: string,
    @Res() res: Response,
  ) {
    this.logger.log(
      `[活动] 按 hashId 转换文件：用户ID=${userId}, 哈希ID=${body.fileHashId}, 类型=${body.type}`,
    );
    const content = await this.activityService.convertByHashId(
      body.fileHashId,
      body.type,
      userId,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader(
      'Content-Disposition',
      createContentDisposition(content.filename),
    );
    return res.send(content.content);
  }

  /**
   * 获取活动地图图层（聚合）
   */
  @Get('/layer')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivitiesLayer(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Query('sportType') sportType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('take') takeRaw?: string,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.user_id_cannot_be_empty'),
      });
    }
    this.logger.debug(
      `[活动] 获取活动图层：用户ID=${userId}, 运动类型=${sportType ?? 'ALL'}, 开始日期=${startDate ?? 'NA'}, 结束日期=${endDate ?? 'NA'}, take=${takeRaw ?? 'NA'}`,
    );
    const take = Number(takeRaw);
    const layer = await this.activityService.getActivitiesLayer(userId, {
      sportType,
      startDate,
      endDate,
      take:
        Number.isFinite(take) && take > 0
          ? Math.min(Math.floor(take), 100)
          : undefined,
      readOnly: Boolean(publicDemo),
    });
    return layer;
  }

  /**
   * 获取单个活动的地图图层（按 hashId）
   */
  @Get(':hashId/layer')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivityLayer(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
  ) {
    this.logger.debug(`[活动] 获取活动图层：哈希ID=${hashId}`);
    const layer = await this.activityMapDerivation.getActivityLayerByHash(
      hashId,
      100,
      {
        userId,
        readOnly: Boolean(publicDemo),
      },
    );
    // 计算边界框与中心点
    const { bounds, center } =
      await this.activityService.computeBoundsAndCenter(layer.maps);
    return {
      maps: layer.maps,
      bounds,
      center,
    };
  }

  /**
   * 获取单个活动详情（优先按 hashId，兼容尚未生成 hashId 的数字 id）
   */
  @Get(':hashId/readiness')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivityReadiness(
    @CurrentUserId() userId: string,
    @ActivityHashId() hashId: string,
  ) {
    return this.activityQuery.getActivityReadiness(hashId, userId);
  }

  @Get(':hashId')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivity(
    @CurrentUserId() userId: string,
    @ActivityHashId() hashId: string,
    @Query('includeStrengthInProgress') includeStrengthInProgress?: string,
  ) {
    this.logger.debug(
      `[活动] 获取活动详情：用户ID=${userId}, 活动标识=${hashId}`,
    );
    const activity = await this.activityQuery.getActivityByIdentifier(
      hashId,
      userId,
    );
    const status = String(activity.processingStatus ?? '').toUpperCase();
    const ready = Boolean(activity.readyAt) || status === 'READY';
    const strengthInProgress =
      includeStrengthInProgress === '1' &&
      activity.sportDefinitionCode === 'STRENGTH_TRAINING';
    if (!ready && !strengthInProgress) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACTIVITY_NOT_FOUND,
        message: this.i18n.t(
          'common.error.activity_not_found_or_no_permission',
        ),
      });
    }
    return activity;
  }

  /**
   * 获取功率持续曲线（按时间区间聚合）
   */
  @Post('power/duration-curve')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPowerDataByTimeRanges(
    @Body()
    body: {
      timeRanges: {
        start?: string;
        end?: string;
      }[];
      sportType?: 'all' | $Enums.SportType;
    },
    @CurrentUserId() userId: string,
  ) {
    if (
      !body.timeRanges ||
      !Array.isArray(body.timeRanges) ||
      body.timeRanges.length === 0
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }

    this.logger.debug(
      `[活动] 获取功率持续曲线：用户ID=${userId}, 区间数=${body.timeRanges.length}, 运动类型=${body?.sportType ?? 'all'}`,
    );
    return await this.powerService.getPowerDurationCurve(
      body?.timeRanges,
      userId,
      body?.sportType,
    );
  }

  @Post('power/duration-curve-points')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPowerDurationCurvePointsByTimeRanges(
    @Body()
    body: {
      timeRanges: {
        start?: string;
        end?: string;
      }[];
      sportType?: 'all' | $Enums.SportType;
    },
    @CurrentUserId() userId: string,
  ) {
    if (
      !body.timeRanges ||
      !Array.isArray(body.timeRanges) ||
      body.timeRanges.length === 0
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }

    this.logger.debug(
      `[活动] 获取功率持续曲线点：用户ID=${userId}, 区间数=${body.timeRanges.length}, 运动类型=${body?.sportType ?? 'all'}`,
    );
    return await this.powerService.getPowerDurationCurvePoints(
      body?.timeRanges,
      userId,
      body?.sportType,
    );
  }

  @Post('power/zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPowerZonesDistributionByTimeRanges(
    @Body()
    body: {
      timeRanges: {
        start?: string;
        end?: string;
      }[];
      sportType?: 'all' | $Enums.SportType;
    },
    @CurrentUserId() userId: string,
  ) {
    if (
      !body.timeRanges ||
      !Array.isArray(body.timeRanges) ||
      body.timeRanges.length === 0
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }

    this.logger.debug(
      `[活动] 获取功率分区分布：用户ID=${userId}, 区间数=${body.timeRanges.length}, 运动类型=${body?.sportType ?? 'all'}`,
    );
    return await this.powerService.getPowerZonesDistribution(
      body?.timeRanges,
      userId,
      body?.sportType,
    );
  }

  @Post('heart-rate/zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getHeartRateZonesDistributionByTimeRanges(
    @Body()
    body: {
      timeRanges: {
        start?: string;
        end?: string;
      }[];
      sportType?: 'all' | $Enums.SportType;
    },
    @CurrentUserId() userId: string,
  ) {
    if (
      !body.timeRanges ||
      !Array.isArray(body.timeRanges) ||
      body.timeRanges.length === 0
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }

    this.logger.debug(
      `[活动] 获取心率分区分布：用户ID=${userId}, 区间数=${body.timeRanges.length}, 运动类型=${body?.sportType ?? 'all'}`,
    );
    return await this.heartRateService.getHeartRateZonesDistribution(
      body?.timeRanges,
      userId,
      body?.sportType,
    );
  }

  @Post('pace/zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPaceZonesDistributionByTimeRanges(
    @Body()
    body: {
      timeRanges: {
        start?: string;
        end?: string;
      }[];
      sportType?: 'all' | $Enums.SportType;
    },
    @CurrentUserId() userId: string,
  ) {
    if (
      !body.timeRanges ||
      !Array.isArray(body.timeRanges) ||
      body.timeRanges.length === 0
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    this.logger.debug(
      `[活动] 获取配速分区分布：用户ID=${userId}, 区间数=${body.timeRanges.length}, 运动类型=${body?.sportType ?? 'all'}`,
    );
    return await this.paceService.getPaceZonesDistribution(
      body?.timeRanges,
      userId,
      body?.sportType,
    );
  }

  @Get('power/mmp-history')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPowerMmpHistory(
    @CurrentUserId() userId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('bucket') bucket?: 'day' | 'week' | 'month',
    @Query('duration')
    duration?: '5s' | '10s' | '30s' | '1m' | '5m' | '20m' | '60m',
    @Query('sportType') sportType?: 'all' | $Enums.SportType,
  ) {
    if (!start || !end || !bucket || !duration) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    if (!['day', 'week', 'month'].includes(bucket)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    if (!['5s', '10s', '30s', '1m', '5m', '20m', '60m'].includes(duration)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }

    this.logger.debug(
      `[活动] 获取 MMP 历史：用户ID=${userId}, 开始=${start}, 结束=${end}, 分桶=${bucket}, 时长=${duration}, 运动类型=${sportType ?? 'all'}`,
    );
    return await this.powerService.getPowerMmpHistory({
      start,
      end,
      userId,
      bucket,
      duration,
      sportType: sportType ?? 'all',
    });
  }

  /**
   * 获取心率持续曲线（按时间区间聚合）
   */
  @Post('heart-rate/duration-curve')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getHeartRateDataByTimeRanges(
    @Body()
    body: {
      timeRanges: {
        start?: string;
        end?: string;
      }[];
      sportType?: 'all' | $Enums.SportType;
    },
    @CurrentUserId() userId: string,
  ) {
    if (
      !body.timeRanges ||
      !Array.isArray(body.timeRanges) ||
      body.timeRanges.length === 0
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }

    this.logger.debug(
      `[活动] 获取心率持续曲线：用户ID=${userId}, 区间数=${body.timeRanges.length}, 运动类型=${body?.sportType ?? 'all'}`,
    );
    return await this.heartRateService.getHeartRateDurationCurve(
      body?.timeRanges,
      userId,
      body?.sportType,
    );
  }

  @Get(':hashId/power/duration-curve')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getActivityPowerDurationCure(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取单活动功率持续曲线：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    const curve =
      await this.activityService.getActivityPowerDurationCurveByHashId(
        hashId,
        userId,
      );
    return curve;
  }

  @Get(':hashId/heart-rate/duration-curve')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getActivityHeartRateDurationCure(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取单活动心率持续曲线：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    const curve =
      await this.activityService.getActivityHeartRateDurationCurveByHashId(
        hashId,
        userId,
      );
    return curve;
  }

  /**
   * 获取单活动功率基础分析（按 hashId）
   */
  @Get(':hashId/power/base')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getActivityPowerBase(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取单活动功率基础分析：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    const base = await this.activityService.getActivityPowerBaseByHashId(
      hashId,
      userId,
    );
    return base;
  }
  /**
   * 获取单活动心率/功率比（按 hashId）
   */
  @Get(':hashId/heart-power-ratio')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getHeartRatePowerRatio(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取心率功率比：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    const ratioData = await this.activityService.getHeartRatePowerRatio(
      hashId,
      userId,
    );
    return ratioData;
  }

  /**
   * 获取单活动心率基础分析（按 hashId）
   */
  @Get(':hashId/heart-rate/base')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getHeartRateBaseByActivityHashId(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取单活动心率基础分析：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    const heartRateBase =
      await this.activityService.getHeartRateBaseByActivityHashId(
        hashId,
        userId,
      );
    return heartRateBase;
  }

  @Get(':hashId/pace/base')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPaceBaseByActivityHashId(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取单活动配速基础分析：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    return await this.activityService.getPaceBaseByActivityHashId(
      hashId,
      userId,
    );
  }

  @Get(':hashId/pace/zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPaceZonesByActivityHashId(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取单活动配速分区：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    return await this.activityService.getPaceZonesByActivityHashId(
      hashId,
      userId,
    );
  }

  /**
   * 获取单活动游泳概览（按 hashId）
   */
  @Get(':hashId/swim/overview')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  @Log({ context: 'getActivitySwimOverview' })
  async getActivitySwimOverview(
    @ActivityHashId() hashId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[活动] 获取游泳概览：用户ID=${userId}, 哈希ID=${hashId}`,
    );
    return await this.activityService.getSwimOverviewByHashId(hashId, userId);
  }

  /**
   * 获取导入批次概览
   */
  @Get('import/batches/:batchId')
  async getImportBatch(
    @Param('batchId') batchId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(`[导入] 获取批次：用户ID=${userId}, 批次ID=${batchId}`);
    return await this.importBatchService.getBatchSummary(batchId, userId);
  }

  /**
   * 获取导入批次明细
   */
  @Get('import/batches/:batchId/items')
  async getImportBatchItems(
    @Param('batchId') batchId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(
      `[导入] 获取批次明细：用户ID=${userId}, 批次ID=${batchId}`,
    );
    return await this.importBatchService.getBatchItems(batchId, userId);
  }
}
