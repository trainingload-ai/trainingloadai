import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { ActivityModule } from '../activity/activity.module';
import { WorkoutModule } from '../workout/workout.module';

@Module({
  imports: [ActivityModule, WorkoutModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
