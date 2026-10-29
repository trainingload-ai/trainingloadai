import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { OAuthHybridAuthGuard } from '@/oauth/oauth-hybrid-auth.guard';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { PlanService } from '../plan.service';
import { PlanSummaryService } from '../application/plan-summary.service';
import { PlanShareService } from '../application/plan-share.service';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';
import { ActivatePlanDto } from '../dto/activate-plan.dto';
import { PauseOrCancelPlanDto } from '../dto/pause-or-cancel-plan.dto';
import { CompletePlanDto } from '../dto/complete-plan.dto';
import { LinkPlanWorkoutActivityDto } from '../dto/link-plan-workout-activity.dto';
import { UpdatePlanWorkoutStatusDto } from '../dto/update-plan-workout-status.dto';
import { UpdatePlanWorkoutDto } from '../dto/update-plan-workout.dto';
import { CreateScheduledWorkoutDto } from '../dto/create-scheduled-workout.dto';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

@Controller('plans')
@UseGuards(OAuthHybridAuthGuard)
export class PlanController {
  private readonly logger = new Logger(PlanController.name);

  constructor(
    private readonly planService: PlanService,
    private readonly planSummary: PlanSummaryService,
    private readonly planShares: PlanShareService,
  ) {}

  @Get()
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async listPlans(@CurrentUserId() userId: string) {
    return this.planService.listPlans(userId);
  }

  @Get('active')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async getActive(@CurrentUserId() userId: string) {
    return this.planService.getActivePlan(userId);
  }

  @Get('scheduled-workouts')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async listScheduledWorkouts(
    @CurrentUserId() userId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.planService.listScheduledWorkouts(userId, start, end);
  }

  @Post('workouts/independent')
  async createIndependentWorkout(
    @CurrentUserId() userId: string,
    @Body() dto: CreateScheduledWorkoutDto,
  ) {
    return this.planService.createIndependentWorkout(userId, dto);
  }

  @Get('workouts/independent/:workoutId')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async getIndependentWorkoutDetail(
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.getIndependentWorkoutDetail(userId, workoutId);
  }

  @Delete('workouts/independent/:workoutId')
  async deleteIndependentWorkout(
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.deleteIndependentWorkout(userId, workoutId);
  }

  @Get(':planId')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async getPlanDetail(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.getPlanDetail(userId, planId);
  }

  @Get(':planId/summary')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async getPlanSummary(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
  ) {
    try {
      const summary = await this.planSummary.summarize(userId, planId);
      return { summary };
    } catch (err) {
      if (err instanceof Error && err.message === 'Plan not found') {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: 'Plan not found',
        });
      }
      throw err;
    }
  }

  @Post()
  async createPlan(
    @CurrentUserId() userId: string,
    @Body() dto?: CreatePlanDto,
  ) {
    return this.planService.createPlan(userId, dto!);
  }

  @Post(':planId/workouts')
  async createPlanWorkout(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateScheduledWorkoutDto,
  ) {
    return this.planService.createPlanWorkout(userId, planId, dto);
  }

  @Post(':planId/workouts/:workoutId/attach')
  async attachWorkoutToPlan(
    @Param('planId') planId: string,
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.attachWorkoutToPlan(userId, planId, workoutId);
  }

  @Put(':planId')
  async updatePlan(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: UpdatePlanDto,
  ) {
    return this.planService.updatePlan(userId, planId, dto!);
  }

  @Post(':planId/shares')
  async createPlanShare(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planShares.createFromPlan(userId, planId);
  }

  @Post(':planId/activate')
  async activatePlan(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: ActivatePlanDto,
  ) {
    return this.planService.activatePlan(userId, planId, dto?.startDate);
  }

  @Post(':planId/pause')
  async pausePlan(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: PauseOrCancelPlanDto,
  ) {
    return this.planService.pausePlan(userId, planId, dto?.reason);
  }

  @Post(':planId/complete')
  async completePlan(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: CompletePlanDto,
  ) {
    return this.planService.completePlan(
      userId,
      planId,
      dto?.completedAt,
      dto?.reason,
    );
  }

  @Post(':planId/cancel')
  async cancelPlan(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: PauseOrCancelPlanDto,
  ) {
    return this.planService.cancelPlan(userId, planId, dto?.reason);
  }

  @Delete(':planId')
  async deletePlan(
    @Param('planId') planId: string,
    @CurrentUserId() userId: string,
  ) {
    this.logger.debug(`[计划] 删除计划，planId=${planId}`);
    return this.planService.deletePlan(userId, planId);
  }

  @Get(':planId/workouts/:workoutId')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async getWorkoutDetail(
    @Param('planId') planId: string,
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.getWorkoutDetail(userId, planId, workoutId);
  }

  @Post(':planId/workouts/:workoutId/status')
  async updateWorkoutStatus(
    @Param('planId') planId: string,
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: UpdatePlanWorkoutStatusDto,
  ) {
    return this.planService.updateWorkoutStatus(
      userId,
      planId,
      workoutId,
      dto!.status,
    );
  }

  @Put(':planId/workouts/:workoutId')
  async updateWorkout(
    @Param('planId') planId: string,
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: UpdatePlanWorkoutDto,
  ) {
    return this.planService.updateWorkout(userId, planId, workoutId, dto!, {
      source: 'manual',
      action: 'workout_update',
    });
  }

  @Get(':planId/workouts/:workoutId/links')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  async getWorkoutLinks(
    @Param('planId') planId: string,
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.getWorkoutLinks(userId, planId, workoutId);
  }

  @Post(':planId/workouts/:workoutId/links')
  async linkWorkoutActivity(
    @Param('planId') planId: string,
    @Param('workoutId') workoutId: string,
    @CurrentUserId() userId: string,
    @Body() dto?: LinkPlanWorkoutActivityDto,
  ) {
    return this.planService.linkWorkoutActivity(
      userId,
      planId,
      workoutId,
      dto!,
    );
  }

  @Delete(':planId/workouts/:workoutId/links/:linkId')
  async unlinkWorkoutActivity(
    @Param('planId') planId: string,
    @Param('workoutId') workoutId: string,
    @Param('linkId') linkId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.planService.unlinkWorkoutActivity(
      userId,
      planId,
      workoutId,
      linkId,
    );
  }
}
