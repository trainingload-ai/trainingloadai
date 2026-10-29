import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UserIdentityRepository } from './persistence/user-identity.repository';
import { UserQueryService } from './user-query.service';

/**
 * 只含 User 查询口，避免 Billing/OAuth → UsersModule 环。
 */
@Module({
  imports: [PrismaModule],
  providers: [UserIdentityRepository, UserQueryService],
  exports: [UserQueryService],
})
export class UserQueryModule {}
