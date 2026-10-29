import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { SportCatalogController } from './sport-catalog.controller';
import { SportCatalogService } from './sport-catalog.service';
import { SportCatalogRepository } from './persistence/sport-catalog.repository';

@Module({
  imports: [PrismaModule],
  controllers: [SportCatalogController],
  providers: [SportCatalogRepository, SportCatalogService],
  exports: [SportCatalogService],
})
export class SportCatalogModule {}
