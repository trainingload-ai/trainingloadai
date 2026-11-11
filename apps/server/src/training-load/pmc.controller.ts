import {
  PMC_PROJECTION_SCOPES,
  PMC_PROJECTION_SCENARIOS,
  type PmcProjectionScope,
  type PmcProjectionScenario,
} from '@shared/pmc-projection';
import { computeTrainingLoadMonotony } from '@/algorithm/utils';
import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { PMCService } from './pmc.service';
import { VdotForecastService } from './vdot-forecast.service';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import {
  CurrentPublicDemo,
  type PublicDemoRequestContext,
} from '@/public-demo/current-public-demo.decorator';

dayjs.extend(utc);

class GetPMCDataDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

class GetPmcProjectionDto {
  @IsOptional()
  @IsIn(PMC_PROJECTION_SCOPES)
  scope?: PmcProjectionScope;

  @IsOptional()
  @IsIn(PMC_PROJECTION_SCENARIOS)
  scenario?: PmcProjectionScenario;

  @IsOptional()
  @IsIn(['60', '90'])
  historyDays?: string;
}

@Controller('pmc')
@UseGuards(OAuthHybridAuthGuard)
export class PMCController {
  constructor(
    private readonly pmcService: PMCService,
    private readonly vdotForecast: VdotForecastService,
  ) {}

  @Get('vdot-forecast')
  getVdotForecast(@CurrentUserId() userId: string) {
    return this.vdotForecast.getForecast(userId);
  }

  @Get('projection')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.TRAINING_READ)
  async getProjection(
    @Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    query: GetPmcProjectionDto,
    @CurrentUserId() userId: string,
  ) {
    return this.pmcService.getProjection(userId, {
      scope: query.scope,
      scenario: query.scenario,
      historyDays: query.historyDays === '90' ? 90 : 60,
    });
  }

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
    const defaultStartDate = dayjs.utc().subtract(60, 'day').toDate();

    const endDate =
      query.endDate && query.startDate
        ? dayjs.utc(query.endDate).toDate()
        : defaultEndDate;
    const startDate =
      query.endDate && query.startDate
        ? dayjs.utc(query.startDate).toDate()
        : defaultStartDate;

    // Fetch data with extra 6 days for rolling window calculation
    const extendedStartDate = dayjs.utc(startDate).subtract(6, 'day').toDate();

    const result = await this.pmcService.getPMCData(
      userId,
      extendedStartDate,
      endDate,
      { ensureCurrent: !publicDemo },
    );

    // Create a map for quick lookup by date string YYYY-MM-DD
    const resultMap = new Map<string, any>();
    result.forEach((r) => {
      resultMap.set(dayjs.utc(r.date).format('YYYY-MM-DD'), r);
    });

    const formattedResults = [];
    let currentDate = dayjs.utc(startDate).startOf('day');
    const end = dayjs.utc(endDate).startOf('day');

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
        activityCount: currentRecord?.activityCount || 0,
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
      ? dayjs.utc(query.startDate).startOf('day').toDate()
      : undefined;
    const endDate = query.endDate
      ? dayjs.utc(query.endDate).endOf('day').toDate()
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
      ? dayjs.utc(query.startDate).startOf('day').toDate()
      : undefined;
    const endDate = query.endDate
      ? dayjs.utc(query.endDate).endOf('day').toDate()
      : undefined;
    return this.pmcService.getVo2MaxActivityHistory(userId, startDate, endDate);
  }
}
