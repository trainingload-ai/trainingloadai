import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';

@Injectable()
export class SensorFileRepository {
  constructor(private readonly prisma: PrismaService) {}

  parquetFiles(tx?: PrismaClientSlice<'activityParquetFile'>) {
    return prismaModel(this.prisma, tx).activityParquetFile;
  }

  garbage(tx?: PrismaClientSlice<'storageObjectGarbage'>) {
    return prismaModel(this.prisma, tx).storageObjectGarbage;
  }
}
