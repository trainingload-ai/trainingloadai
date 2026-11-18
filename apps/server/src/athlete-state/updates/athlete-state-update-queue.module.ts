import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { AthleteStateUpdateQueue } from './athlete-state-update-queue.service';

@Module({
  imports: [PrismaModule],
  providers: [AthleteStateUpdateQueue],
  exports: [AthleteStateUpdateQueue],
})
export class AthleteStateUpdateQueueModule {}
