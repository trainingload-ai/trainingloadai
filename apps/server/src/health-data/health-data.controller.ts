import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { HealthDataQueryService } from './health-data-query.service';
import type { HealthIntradayMetricKey } from './health-data-query.service';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

/** 每日及日内健康投影的鉴权只读 HTTP API。 */
@Controller('health-data')
export class HealthDataController {
  constructor(private readonly healthDataQuery: HealthDataQueryService) {}

  /** 返回有界的每日概览；服务层会限制请求范围。 */
  @Get('overview')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  overview(
    @CurrentUserId() userId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthDataQuery.getOverview(userId, days, endDate);
  }

  /** 返回某个指标键对应的已选 provider 有效日内序列。 */
  @Get('intraday')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  intraday(
    @CurrentUserId() userId: string,
    @Query('key') key: HealthIntradayMetricKey,
    @Query('endDate') endDate?: string,
  ) {
    return this.healthDataQuery.getIntraday(userId, key, endDate);
  }
}
