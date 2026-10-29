import { Body, Controller, Get, Post, Query, Logger } from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { PaceService } from './pace.service';
import { PaceDistancePerformanceRequestDto } from './dto/pace-distance-performance.dto';
import { SportType } from '@prisma/client';
import { PaceZonePreviewQueryDto } from './dto/pace-zone-preview.dto';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';

/**
 * 配速相关接口（需要登录）
 *
 * 说明：
 * - 用于配速能力的区间配置、距离-表现曲线等查询
 * - 所有接口均要求登录态（全局 OAuthHybridAuthGuard）
 */
@Controller('pace')
export class PaceController {
  private readonly logger = new Logger(PaceController.name);

  constructor(private readonly paceService: PaceService) {}

  /**
   * 距离-表现数据查询（用于 best-distance / 目标配速等页面）
   *
   * 入参：
   * - dto: sportType、距离区间 ranges、目标 targets、mode、limit 等
   *
   * 返回：
   * - 每个距离区间的最好表现（由 PaceService.getDistancePerformanceByRanges 输出）
   */
  @Post('distance-performance')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getDistancePerformance(
    @Body() dto: PaceDistancePerformanceRequestDto,
    @CurrentUserId() userId: string,
  ) {
    return await this.paceService.getDistancePerformanceByRanges(
      userId,
      dto.sportType,
      dto.ranges || [],
      dto.targets || dto.distances,
      dto.mode,
      dto.limit,
    );
  }

  /**
   * 获取配速区间配置
   *
   * 用途：
   * - 前端展示配速区间（PACE/CUSTOM 等），支持按活动或用户配置获取
   *
   * 示例：
   * - GET `/pace/zones?activityId=<hashId>&sportType=RUN&type=PACE`
   */
  @Get('zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPaceZones(
    @Query('activityId') activityId?: string,
    @Query('type') type?: 'PACE' | 'CUSTOM',
    @Query('sportType') sportType?: SportType,
    @CurrentUserId() userId?: string,
    @CurrentPublicDemo() publicDemo?: PublicDemoRequestContext | null,
  ) {
    const result = await this.paceService.getPaceZones(activityId, {
      userId,
      sportType,
      readOnly: Boolean(publicDemo),
    });

    return result;
  }

  /** Read-only previews of automatic models; selecting a model does not save it. */
  @Get('zones/preview')
  getPaceZonePreviews(
    @Query() query: PaceZonePreviewQueryDto,
    @CurrentUserId() userId: string,
  ) {
    return this.paceService.getPaceZonePreviews(userId, query.sportType);
  }
}
