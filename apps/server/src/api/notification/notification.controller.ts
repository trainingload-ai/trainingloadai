import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { NotificationService } from './notification.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { I18nService } from 'nestjs-i18n';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly service: NotificationService,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  async list(
    @CurrentUserId() userId: string,
    @Query() q?: ListNotificationsDto,
  ) {
    const unread =
      String(q?.unread ?? '').trim() === '1' ||
      String(q?.unread ?? '')
        .trim()
        .toLowerCase() === 'true';
    return this.service.list({
      userId,
      offset: q?.offset,
      limit: q?.limit,
      unread: unread ? true : undefined,
    });
  }

  @Post('read-all')
  async readAll(@CurrentUserId() userId: string) {
    return this.service.markAllRead({ userId });
  }

  @Post(':id/read')
  async read(@CurrentUserId() userId: string, @Param('id') id?: string) {
    const nid = String(id ?? '').trim();
    if (!nid) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.notification_id_required'),
      });
    }
    return this.service.markRead({ userId, id: nid });
  }
}
