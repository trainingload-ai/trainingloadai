import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { ReviewScheduleService } from './review-schedule.service';
import { UpdateReviewScheduleDto } from './dto/update-review-schedule.dto';
import { I18nService } from 'nestjs-i18n';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { ReviewDigestType } from '@prisma/client';

@Controller('review/schedules')
export class ReviewScheduleController {
  constructor(
    private readonly service: ReviewScheduleService,
    private readonly i18n: I18nService,
  ) {}

  private parseReviewType(type?: string): ReviewDigestType {
    const t = String(type ?? '')
      .trim()
      .toUpperCase();
    if (t !== 'DAILY' && t !== 'WEEKLY' && t !== 'MONTHLY') {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_review_type'),
      });
    }
    return t as ReviewDigestType;
  }

  @Get()
  async list(@CurrentUserId() userId: string) {
    return this.service.getSchedules(userId);
  }

  @Patch(':type')
  async patch(
    @CurrentUserId() userId: string,
    @Param('type') type?: string,
    @Body() body?: UpdateReviewScheduleDto,
  ) {
    const t = this.parseReviewType(type);
    try {
      return await this.service.updateSchedule(userId, t, {
        enabled: body?.enabled,
        sendAtLocalTime: body?.sendAtLocalTime,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'INVALID_TIME') {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.invalid_send_at_local_time'),
        });
      }
      throw e;
    }
  }

  @Post('trigger/:type')
  async triggerNow(
    @CurrentUserId() userId: string,
    @Param('type') type?: string,
  ) {
    const t = this.parseReviewType(type);
    return this.service.triggerNow(userId, t);
  }
}
