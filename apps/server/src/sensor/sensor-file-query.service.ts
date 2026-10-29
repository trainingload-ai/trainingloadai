import { Injectable } from '@nestjs/common';
import { SensorFileRepository } from './persistence/sensor-file.repository';

/**
 * Parquet / GC 文件口。给 Importing materializer、Activity、导出用，
 * 避免它们直写 activityParquetFile / storageObjectGarbage。
 */
@Injectable()
export class SensorFileQueryService {
  constructor(private readonly files: SensorFileRepository) {}

  parquetFiles(tx?: Parameters<SensorFileRepository['parquetFiles']>[0]) {
    return this.files.parquetFiles(tx);
  }

  garbage(tx?: Parameters<SensorFileRepository['garbage']>[0]) {
    return this.files.garbage(tx);
  }

  listExportParquetFiles(userId: string, cutoff: Date) {
    return this.files.parquetFiles().findMany({
      where: {
        activity: {
          userId,
          createdAt: { lte: cutoff },
        },
      },
      include: {
        activity: {
          select: {
            hashId: true,
            distance: true,
            startTime: true,
            endTime: true,
          },
        },
      },
      orderBy: [{ activityId: 'asc' }, { type: 'asc' }],
    });
  }
}
