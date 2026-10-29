import { Module } from '@nestjs/common';

import { FeatureAccessController } from './feature-access.controller';

@Module({
  controllers: [FeatureAccessController],
})
export class FeatureAccessModule {}
