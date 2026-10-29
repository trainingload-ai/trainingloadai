import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import dayjs = require('dayjs');
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { ActivityQueryService } from './activity-query.service';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

const FITNESS_ACTIVITY_DEFINITION_CODES = [
  'STRENGTH_TRAINING',
  'STRETCHING',
  'HIIT',
  'YOGA',
  'ROWING',
  'ELLIPTICAL',
] as const;

/**
 * 活动时间线只负责活动列表的统一读取模型。
 *
 * 它将正式 Activity 与尚未解析的外部活动影子合并为一个稳定排序、可使用
 * cursor 翻页的列表。影子仍然不是 Activity，不能参加训练负荷计算、PMC、
 * workout 绑定等正式活动能力。
 *
 * 该接口使用独立的 /activities/timeline 子路径；旧 GET /activities 继续保持
 * 原有契约，避免已有调用方被隐式改变。
 */
@Controller('activities')
@UseGuards(OAuthHybridAuthGuard)
export class ActivityTimelineController {
  constructor(
    private readonly activityQuery: ActivityQueryService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * 获取由正式 Activity 与未解析外部来源组成的统一时间线。
   *
   * 服务端负责跨来源排序和 cursor 分页；返回项以 kind 区分，影子不具备
   * Activity 身份，也不计入 totalActivities。
   */
  @Get('timeline')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.ACTIVITIES_READ)
  async getActivityTimeline(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('sportType') sportType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('thirdPartyProvider') thirdPartyProvider?: string,
    @Query('search') search?: string,
    @Query('minDuration') minDuration?: string,
    @Query('maxDuration') maxDuration?: string,
    @Query('minDistance') minDistance?: string,
    @Query('maxDistance') maxDistance?: string,
    @Query('timeZone') timeZone?: string,
  ) {
    const limitNum = limit ? Number.parseInt(limit, 10) : 20;
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      this.throwInvalidQuery();
    }
    if (Boolean(startDate) !== Boolean(endDate)) {
      this.throwInvalidQuery();
    }
    if (startDate && endDate) {
      const start = dayjs(startDate).startOf('day');
      const end = dayjs(endDate).endOf('day');
      if (end.isBefore(start) || end.diff(start, 'month', true) > 3) {
        this.throwInvalidQuery();
      }
    }

    return this.activityQuery.getActivityTimeline({
      userId,
      readOnly: Boolean(publicDemo),
      cursor: cursor?.trim() || undefined,
      limit: limitNum,
      filters: {
        sportType:
          sportType === 'all' || sportType === 'FITNESS'
            ? undefined
            : sportType,
        sportDefinitionCodes:
          sportType === 'FITNESS'
            ? FITNESS_ACTIVITY_DEFINITION_CODES
            : undefined,
        startDate: startDate
          ? dayjs(startDate).startOf('day').toDate()
          : undefined,
        endDate: endDate ? dayjs(endDate).endOf('day').toDate() : undefined,
        thirdPartyProvider,
        search,
        minDuration: minDuration ? Number.parseInt(minDuration, 10) : undefined,
        maxDuration: maxDuration ? Number.parseInt(maxDuration, 10) : undefined,
        minDistance: minDistance ? Number.parseFloat(minDistance) : undefined,
        maxDistance: maxDistance ? Number.parseFloat(maxDistance) : undefined,
        calendarTimeZone: timeZone?.trim() || undefined,
      },
    });
  }

  private throwInvalidQuery(): never {
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message: this.i18n.t('common.error.query_condition_error'),
    });
  }
}
