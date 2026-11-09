import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SensorDataModule } from '../sensor/sensor-data.module';
import { RoutesDataModule } from './routes-data.module';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { RoutesDeliveryLinksService } from './routes-delivery-links.service';
import { ExternalProviderIntegrationModule } from '../integrations/external-provider/external-provider-integration.module';
@Module({
  imports: [
    PrismaModule,
    StorageModule,
    SensorDataModule,
    RoutesDataModule,
    ExternalProviderIntegrationModule,
  ],
  controllers: [RoutesController],
  providers: [RoutesService, RoutesDeliveryLinksService],
  exports: [RoutesService, RoutesDataModule, RoutesDeliveryLinksService],
})
export class RoutesModule {}
