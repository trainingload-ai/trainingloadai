import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module';
import { ElevationService } from './elevation.service';

@Module({
  imports: [ConfigModule, StorageModule],
  providers: [ElevationService],
  exports: [ElevationService],
})
export class ElevationModule {}
