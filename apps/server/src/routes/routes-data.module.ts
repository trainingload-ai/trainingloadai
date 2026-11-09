import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RoutesReadService } from './routes-read.service';
@Module({
  imports: [PrismaModule],
  providers: [RoutesReadService],
  exports: [RoutesReadService],
})
export class RoutesDataModule {}
