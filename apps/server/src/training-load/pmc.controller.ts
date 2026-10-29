import { computeTrainingLoadMonotony } from '@/algorithm/utils';
import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import dayjs = require('dayjs');
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { PMCService } from './pmc.service';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';

class GetPMCDataDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@Controller('pmc')
@UseGuards(OAuthHybridAuthGuard)
export class PMCController {
  constructor(private readonly pmcService: PMCService) {}

  /**
   * 手动触发重新计算
   */
  @Post('calculate')
  async recalculatePMC(@CurrentUserId() userId: string) {
    return this.pmcService.recalculatePMC(userId);
  }

  /**
   * 查询PMC数据
   * 根据时间范围查询，按天聚合，缺失天数按衰退原理处理
   */
  @Get('data')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPMCData(
    @Query(ValidationPipe) query: GetPMCDataDto,
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
  ) {
    // 默认查询最近60天的数据
    const defaultEndDate = new Date();
    const defaultStartDate = dayjs().subtract(60, 'day').toDate();

    const endDate =
      query.endDate && query.startDate
        ? dayjs(query.endDate).toDate()
        : defaultEndDate;
    const startDate =
      query.endDate && query.startDate
        ? dayjs(query.startDate).toDate()
        : defaultStartDate;

    // Fetch data with extra 6 days for rolling window calculation
    const extendedStartDate = dayjs(startDate).subtract(6, 'day').toDate();

    const result = await this.pmcService.getPMCData(
      userId,
      extendedStartDate,
      endDate,
      { ensureCurrent: !publicDemo },
    );

    // Create a map for quick lookup by date string YYYY-MM-DD
    const resultMap = new Map<string, any>();
    result.forEach((r) => {
      resultMap.set(dayjs(r.date).format('YYYY-MM-DD'), r);
    });

    const formattedResults = [];
    let currentDate = dayjs(startDate);
    const end = dayjs(endDate);

    while (currentDate.isBefore(end) || currentDate.isSame(end)) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const currentRecord = resultMap.get(dateStr);

      // Calculate Monotony & Strain for this day (using last 7 days including today)
      const last7DaysLoad: number[] = [];
      for (let i = 0; i < 7; i++) {
        const d = currentDate.subtract(i, 'day').format('YYYY-MM-DD');
        const r = resultMap.get(d);
        // Use dailyValue if exists, otherwise 0
        last7DaysLoad.push(r?.dailyValue || 0);
      }

      const { monotony, trainingStrain } =
        computeTrainingLoadMonotony(last7DaysLoad);

      formattedResults.push({
        date: currentDate.toISOString(),
        fitness: currentRecord?.ctl || 0,
        fatigue: currentRecord?.atl || 0,
        form: currentRecord?.tsb || 0,
        value: currentRecord?.dailyValue || 0,
        running: currentRecord?.runningValue || 0,
        cycling: currentRecord?.cyclingValue || 0,
        swimming: currentRecord?.swimmingValue || 0,
        acRatio:
          currentRecord?.ctl > 0
            ? Number((currentRecord.atl / currentRecord.ctl).toFixed(2))
            : 0,
        monotony: Number(monotony.toFixed(2)),
        intensity: Number(trainingStrain.toFixed(2)),
      });

      currentDate = currentDate.add(1, 'day');
    }

    return formattedResults;
  }

  /**
   * 获取 PMC 极值（ATL/CTL/TSB）
   */
  @Get('extremes')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getPMCExtremes(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
  ) {
    return this.pmcService.getExtremes(userId, {
      ensureCurrent: !publicDemo,
    });
  }

  /**
   * 获取状态指标 (VO2 Max, ATL, CTL, TSB, A:C, Monotony, Intensity, Rest Days)
   */
  @Get('status')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getFitnessStatus(
    @CurrentUserId() userId: string,
    @CurrentPublicDemo() publicDemo: PublicDemoRequestContext | null,
  ) {
    return this.pmcService.getFitnessStatus(userId, {
      ensureCurrent: !publicDemo,
    });
  }

  /**
   * Get VO2Max history for chart
   */
  @Get('vo2max-history')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getVo2MaxHistory(
    @Query(ValidationPipe) query: GetPMCDataDto,
    @CurrentUserId() userId: string,
  ) {
    const startDate = query.startDate
      ? dayjs(query.startDate).startOf('day').toDate()
      : undefined;
    const endDate = query.endDate
      ? dayjs(query.endDate).endOf('day').toDate()
      : undefined;
    return this.pmcService.getVo2MaxHistory(userId, startDate, endDate);
  }

  @Get('vo2max-activity-history')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getVo2MaxActivityHistory(
    @Query(ValidationPipe) query: GetPMCDataDto,
    @CurrentUserId() userId: string,
  ) {
    const startDate = query.startDate
      ? dayjs(query.startDate).startOf('day').toDate()
      : undefined;
    const endDate = query.endDate
      ? dayjs(query.endDate).endOf('day').toDate()
      : undefined;
    return this.pmcService.getVo2MaxActivityHistory(userId, startDate, endDate);
  }
}
