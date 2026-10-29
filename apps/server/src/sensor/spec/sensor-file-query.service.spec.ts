import { describe, expect, it, jest } from '@jest/globals';
import { SensorFileQueryService } from '../sensor-file-query.service';
import { SensorFileRepository } from '../persistence/sensor-file.repository';

describe('SensorFileQueryService', () => {
  it('uses the transaction client when one is passed', async () => {
    const txFindMany = jest.fn(async () => [{ id: 'tx-parquet' }]);
    const prismaFindMany = jest.fn(async () => [{ id: 'prisma-parquet' }]);
    const files = new SensorFileQueryService(new SensorFileRepository({
      activityParquetFile: { findMany: prismaFindMany },
      storageObjectGarbage: { findMany: prismaFindMany },
    } as never));

    await files
      .parquetFiles({ activityParquetFile: { findMany: txFindMany } } as never)
      .findMany();
    expect(txFindMany).toHaveBeenCalled();

    await files.parquetFiles().findMany();
    expect(prismaFindMany).toHaveBeenCalled();
  });
});
