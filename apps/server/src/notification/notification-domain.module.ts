import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/api/user/user.module';
import { NotificationDomainService } from './notification-domain.service';
import { PlanCompletedListener } from './plan-completed.listener';
import { NotificationRepository } from './persistence/notification.repository';
import { UserQueryModule } from '@/api/user/user-query.module';

@Module({
  imports: [PrismaModule, UsersModule, UserQueryModule],
  providers: [
    NotificationRepository,
    NotificationDomainService,
    PlanCompletedListener,
  ],
  exports: [NotificationDomainService],
})
export class NotificationDomainModule {}
