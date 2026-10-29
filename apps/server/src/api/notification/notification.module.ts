import { Module } from '@nestjs/common';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [NotificationDomainModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
