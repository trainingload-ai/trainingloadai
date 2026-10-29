import { Controller, Get, Query, Logger, Param } from '@nestjs/common';
import { HeartRateService } from './heart-rate.service';
import { EpocCurveService } from './epoc-curve.service';
import { Optional } from '@thallesp/nestjs-better-auth';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { I18n, I18nContext, I18nService } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { SportType } from '@prisma/client';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';

@Controller('heart-rate')
export class HeartRateController {
  private readonly logger = new Logger(HeartRateController.name);

  constructor(
    private heartRateService: HeartRateService,
    private readonly epocCurveService: EpocCurveService,
    private i18n: I18nService,
  ) {}

  /**
   * Get TRIMP per minute data
   * GET /heart-rate/:activityId/trimp
   */
  @Get(':activityId/trimp')
  @Optional()
  async getTrimpPerMinute(
    @Param('activityId') activityId: string,
    @CurrentUserId() userId?: string,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_user'),
      });
    }
    if (!activityId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_activity'),
      });
    }
    return await this.heartRateService.getTrimpPerMinute(activityId, userId);
  }

  /**
   * Get the heart rate zone settings
   * Returns zones and benchmark (MHR/LTHR/HRR)
   *
   * Query parameters:
   */
  @Get('zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getHeartRateZone(
    @Query('activityId') activityId?: string,
    @Query('sportType') sportType?: SportType,
    @CurrentUserId() userId?: string,
    @CurrentPublicDemo() publicDemo?: PublicDemoRequestContext | null,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_user'),
      });
    }
    const result = await this.heartRateService.getHeartRateZones(activityId, {
      userId,
      sportType,
      readOnly: Boolean(publicDemo),
    });

    return result ?? { zones: [] };
  }

  /**
   * Get heart rate chart data for an activity
   * GET /heart-rate/chart/:activityId
   *
   */
  @Get('chart/:activityId')
  @Optional()
  async getHeartRateChartData(
    @Param('activityId') activityId: string,
    @CurrentUserId() userId?: string,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_user'),
      });
    }
    if (!activityId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_activity'),
      });
    }
    // TODO: refactor
    return null;
  }

  /**
   * Get heart rate segment analysis data
   * GET /heart-rate/segments/:activityId
   */
  @Get('segments/:activityId')
  @Optional()
  async getHeartRateSegmentAnalysis(
    @I18n() i18n: I18nContext,
    @Param('activityId') activityId: string,
    @CurrentUserId() userId?: string,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_user'),
      });
    }
    if (!activityId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_activity'),
      });
    }
    // TODO: refactor
    return null;
  }

  /**
   * Get heart rate trend analysis data
   * GET /heart-rate/trends/:activityId
   */
  @Get('trends/:activityId')
  @Optional()
  async getHeartRateTrendAnalysis(
    @I18n() i18n: I18nContext,
    @Param('activityId') activityId: string,
    @CurrentUserId() userId?: string,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_user'),
      });
    }
    if (!activityId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_activity'),
      });
    }
    // TODO: refactor
    return null;
  }

  /**
   * Get EPOC curve data
   * GET /heart-rate/:activityId/epoc
   */
  @Get(':activityId/epoc')
  @Optional()
  async getEPOCCurve(
    @Param('activityId') activityId: string,
    @CurrentUserId() userId?: string,
  ) {
    if (!userId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_user'),
      });
    }
    if (!activityId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.no_current_activity'),
      });
    }
    return await this.epocCurveService.getEPOCCurve(activityId, userId);
  }
}
