import {
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import type { Response } from 'express';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('subscription')
  async getSubscription(@CurrentUserId() userId: string) {
    return this.calendarService.getOrCreateSubscription(userId);
  }

  @Post('subscription/reset')
  async resetSubscription(@CurrentUserId() userId: string) {
    return this.calendarService.resetSubscription(userId);
  }

  @Get(':token.ics')
  @AllowAnonymous()
  async getFeed(@Param('token') token: string, @Res() res: Response) {
    const feed = await this.calendarService.buildTrainingPlanFeed(token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="trainingload-calendar.ics"',
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(feed);
  }
}
