import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { ActivityModule } from '../activity/activity.module';
import { WorkoutModule } from '../workout/workout.module';
import { PublicUploadFailureCaptureService } from './public-upload-failure-capture.service';

@Module({
  imports: [ActivityModule, WorkoutModule],
  controllers: [PublicController],
  providers: [PublicService, PublicUploadFailureCaptureService],
})
export class PublicModule {}
