import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CompetitionEventSource } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { CompetitionEventService } from './competition-event.service';
import { CompetitionImpactService } from './competition-impact.service';
import { CreateCompetitionEventDto } from './dto/create-competition-event.dto';
import { ListCompetitionEventsDto } from './dto/list-competition-events.dto';
import {
  CompetitionEventVersionDto,
  UpdateCompetitionEventDto,
} from './dto/update-competition-event.dto';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import { AthleteClockService } from '@/timezone/athlete-clock.service';

@Controller('competition-events')
export class CompetitionController {
  constructor(
    private readonly eventService: CompetitionEventService,
    private readonly impactService: CompetitionImpactService,
    private readonly athleteClock: AthleteClockService,
  ) {}

  @Get()
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  list(
    @CurrentUserId() userId: string,
    @Query() query: ListCompetitionEventsDto,
  ) {
    return this.eventService.list({ userId, ...query });
  }

  @Get(':eventId')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PLANS_READ)
  getById(@CurrentUserId() userId: string, @Param('eventId') eventId: string) {
    return this.eventService.getById(userId, eventId);
  }

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body() body: CreateCompetitionEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-client-trace-id') requestId?: string,
  ) {
    const event = await this.eventService.create(userId, {
      input: body,
      source: CompetitionEventSource.MANUAL,
      actorType: 'USER',
      idempotencyKey,
      requestId,
    });
    void this.prewarmImpact(userId, event);
    return event;
  }

  @Patch(':eventId')
  async update(
    @CurrentUserId() userId: string,
    @Param('eventId') eventId: string,
    @Body() body: UpdateCompetitionEventDto,
    @Headers('x-client-trace-id') requestId?: string,
  ) {
    const event = await this.eventService.update({
      userId,
      eventId,
      input: body,
      actorType: 'USER',
      requestId,
    });
    void this.prewarmImpact(userId, event);
    return { event, impactState: 'STALE' as const };
  }

  @Post(':eventId/cancel')
  async cancel(
    @CurrentUserId() userId: string,
    @Param('eventId') eventId: string,
    @Body() body: CompetitionEventVersionDto,
    @Headers('x-client-trace-id') requestId?: string,
  ) {
    const event = await this.eventService.cancelOrRestore({
      userId,
      eventId,
      expectedVersion: body.expectedVersion,
      restore: false,
      actorType: 'USER',
      requestId,
    });
    void this.prewarmImpact(userId, event);
    return event;
  }

  @Post(':eventId/restore')
  async restore(
    @CurrentUserId() userId: string,
    @Param('eventId') eventId: string,
    @Body() body: CompetitionEventVersionDto,
    @Headers('x-client-trace-id') requestId?: string,
  ) {
    const event = await this.eventService.cancelOrRestore({
      userId,
      eventId,
      expectedVersion: body.expectedVersion,
      restore: true,
      actorType: 'USER',
      requestId,
    });
    void this.prewarmImpact(userId, event);
    return event;
  }

  @Delete(':eventId')
  async remove(
    @CurrentUserId() userId: string,
    @Param('eventId') eventId: string,
    @Body() body: CompetitionEventVersionDto,
    @Headers('x-client-trace-id') requestId?: string,
  ) {
    const event = await this.eventService.softDelete({
      userId,
      eventId,
      expectedVersion: body.expectedVersion,
      actorType: 'USER',
      requestId,
    });
    void this.prewarmImpact(userId, event);
    return event;
  }

  private async prewarmImpact(
    userId: string,
    event: { startDate: string; endDate?: string | null },
  ) {
    const locale = resolveSupportedLocale(I18nContext.current()?.lang);
    const anchorDate = await this.athleteClock.todayYmd(userId);
    await this.impactService
      .resolve({
        userId,
        scopeType: 'CALENDAR_RANGE',
        scopeStartDate: event.startDate,
        scopeEndDate: event.endDate || event.startDate,
        anchorDate,
        locale,
      })
      .catch(() => undefined);
  }
}
