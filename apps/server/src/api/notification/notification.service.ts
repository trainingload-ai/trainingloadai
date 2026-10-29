import { Injectable } from '@nestjs/common';
import { NotificationDomainService } from '@/notification/notification-domain.service';

@Injectable()
export class NotificationService {
  constructor(private readonly notifications: NotificationDomainService) {}

  list(args: {
    userId: string;
    offset?: number;
    limit?: number;
    unread?: boolean;
  }) {
    return this.notifications.list(args);
  }

  markRead(args: { userId: string; id: string }) {
    return this.notifications.markRead(args);
  }

  markAllRead(args: { userId: string }) {
    return this.notifications.markAllRead(args);
  }
}
