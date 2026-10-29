import { Test } from '@nestjs/testing';
import { PrismaService } from '@/prisma/prisma.service';
import { HealthDataIngestService } from '../health-data-ingest.service';
import { HealthDataRepository } from '../persistence/health-data.repository';
import { RepairHealthDailyLinksModule } from '../repair-health-daily-links.module';

describe('RepairHealthDailyLinksModule', () => {
  it('starts without an object-storage adapter under a remote-storage deployment', async () => {
    const previousStorageStrategy = process.env.STORAGE_STRATEGY;
    process.env.STORAGE_STRATEGY = 'R2';

    try {
      const moduleRef = await Test.createTestingModule({
        imports: [RepairHealthDailyLinksModule],
      })
        .overrideProvider(PrismaService)
        .useValue({})
        .compile();

      expect(moduleRef.get(HealthDataRepository)).toBeDefined();
      expect(moduleRef.get(HealthDataIngestService)).toBeDefined();
      await moduleRef.close();
    } finally {
      if (previousStorageStrategy === undefined) {
        delete process.env.STORAGE_STRATEGY;
      } else {
        process.env.STORAGE_STRATEGY = previousStorageStrategy;
      }
    }
  });
});
