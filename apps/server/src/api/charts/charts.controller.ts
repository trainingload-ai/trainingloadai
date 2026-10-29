import {
  Controller,
  Get,
  Query,
  Logger,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { ChartsService } from './charts.service';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { I18n, I18nContext } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

/**
 * 图表相关接口（需要登录）
 *
 * 说明：
 * - 用于支持前端图表页的“执行指标查询 / 汇总 / 元信息”等能力
 * - 所有接口均要求登录态（全局 OAuthHybridAuthGuard）
 */
@Controller('charts')
export class ChartsController {
  private readonly logger = new Logger(ChartsController.name);
  constructor(private chartsService: ChartsService) {}

  /**
   * 单活动执行图表查询（按活动维度）
   *
   * 示例：
   * - GET `/charts/execute/activity?activityId=<hashId>&metric=record_speed`
   *
   * 入参：
   * - activityId: 活动 hashId
   * - metric: 指标 key（例如 record_speed）
   *
   * 返回：
   * - 指标序列（具体结构由 ChartsService.executeChartForActivity 定义）
   */
  @Get('execute/activity')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async executeChartForActivity(
    @Query('activityId') hashId: string,
    @Query('metric') metric: string,
    @CurrentUserId() userId?: string,
    @I18n() i18n?: I18nContext,
  ) {
    if (!hashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: i18n?.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }
    if (!metric) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: i18n?.t('common.error.metric_required'),
      });
    }
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.USER_NOT_FOUND,
        message: i18n?.t('common.error.current_user_not_logged_in'),
      });
    }
    return await this.chartsService.executeChartForActivity(
      hashId,
      metric,
      userId,
    );
  }

  /**
   * 单一指标的汇总（按时间范围/运动类型等过滤）
   *
   * 示例：
   * - GET `/charts/summary/metric?key=speed&start=...&end=...&sportType=Run&agg=avg`
   *
   * 入参：
   * - key: 指标 key（固定枚举）
   * - start/end: 可选时间范围
   * - sportType: all/Cycling/Run
   * - agg: avg/max/min
   *
   * 返回：
   * - 汇总结果（具体结构由 ChartsService.getActivityMetricSummary 定义）
   */
  @Get('summary/metric')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getActivityMetricSummary(
    @CurrentUserId() userId: string,
    @Query('key')
    key:
      | 'count'
      | 'distance'
      | 'speed'
      | 'duration'
      | 'power'
      | 'heartRate'
      | 'cadence'
      | 'time'
      | 'climb'
      | 'elevation'
      | 'energy'
      | 'calories'
      | 'hr',
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('sportType') sportType?: 'all' | 'Cycling' | 'Run',
    @Query('agg') agg: 'avg' | 'max' | 'min' = 'avg',
    @Query('mode') mode?: 'day' | 'week' | 'month' | 'year',
    @I18n() i18n?: I18nContext,
  ) {
    if (!key) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: i18n?.t('common.error.metric_required'),
      });
    }
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.USER_NOT_FOUND,
        message: i18n?.t('common.error.current_user_not_logged_in'),
      });
    }
    const timeRange = start && end ? { start, end } : undefined;
    const data = await this.chartsService.getActivityMetricSummary(
      userId,
      key,
      { timeRange, sportType, agg },
    );
    return data;
  }

  @Get('summary/rows')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getChartRows(
    @CurrentUserId() userId: string,
    @Query('key')
    key:
      | 'count'
      | 'distance'
      | 'speed'
      | 'duration'
      | 'power'
      | 'heartRate'
      | 'cadence'
      | 'time'
      | 'climb'
      | 'elevation'
      | 'energy'
      | 'calories'
      | 'hr',
    @Query('mode') mode: 'day' | 'week' | 'month' | 'year',
    @Query('end') end: string,
    @Query('days') days?: string,
    @Query('sportType') sportType?: 'all' | 'Cycling' | 'Run',
    @I18n() i18n?: I18nContext,
  ) {
    try {
      if (!key) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: i18n?.t('common.error.metric_required'),
        });
      }
      if (!userId) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.USER_NOT_FOUND,
          message: i18n?.t('common.error.current_user_not_logged_in'),
        });
      }
      if (!mode || !end)
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: i18n?.t('common.error.query_condition_error'),
        });

      return await this.chartsService.getChartRowsByMode(userId, key, {
        mode,
        end,
        days: days ? Number(days) : undefined,
        sportType,
      });
    } catch (error) {
      this.logger.error('获取图表行数据失败', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        i18n?.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }) || 'Internal Server Error',
      );
    }
  }

  /**
   * 获取图表元信息（用于前端轴/单位/展示配置等）
   *
   * 示例：
   * - GET `/charts/summary/metadata?key=speed&mode=week&end=2026-01-01&sportType=Run`
   */
  @Get('summary/metadata')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getChartMetadata(
    @CurrentUserId() userId: string,
    @Query('key')
    key:
      | 'count'
      | 'distance'
      | 'speed'
      | 'duration'
      | 'power'
      | 'heartRate'
      | 'cadence'
      | 'time'
      | 'climb'
      | 'elevation'
      | 'energy'
      | 'calories'
      | 'hr',
    @Query('mode') mode: 'day' | 'week' | 'month' | 'year',
    @Query('end') end: string,
    @Query('sportType') sportType?: 'all' | 'Cycling' | 'Run',
    @I18n() i18n?: I18nContext,
  ) {
    if (!key) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: i18n?.t('common.error.metric_required'),
      });
    }
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.USER_NOT_FOUND,
        message: i18n?.t('common.error.current_user_not_logged_in'),
      });
    }
    if (!mode || !end) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: i18n?.t('common.error.query_condition_error'),
      });
    }

    return await this.chartsService.getChartMetadataByMode(userId, key, {
      mode,
      end,
      sportType,
    });
  }

  @Get('summary/week-pair')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  /**
   * 获取周摘要对
   * current: 本周（ISO week）汇总
   * previous: 上一周（ISO week）汇总
   */
  async getWeeklySummaryPair(
    @CurrentUserId() userId: string,
    @Query('end') end: string,
    @Query('sportType') sportType?: string,
    @I18n() i18n?: I18nContext,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.USER_NOT_FOUND,
        message: i18n?.t('common.error.current_user_not_logged_in'),
      });
    }
    if (!end) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: i18n?.t('common.error.query_condition_error'),
      });
    }
    return await this.chartsService.getWeeklySummaryPair(userId, {
      end,
      sportType,
    });
  }

  // 已移除聚合接口，应按需在前端单卡片请求
}
