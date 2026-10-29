import { Injectable } from '@nestjs/common';
import {
  ActivityProcessingStatus,
  SportType,
  type ImportSourceKind,
  type Prisma,
  type ThirdPartyProvider,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';
import { readyActivityWhere } from '@/utils/activity-ready-where';

/**
 * 活动只读端口。
 *
 * 给 Plan、Charts、PMC、Coach 等模块查活动，避免它们直查 prisma.activity，
 * 也避免 import 整个 ActivityModule 造成循环依赖。
 *
 * 不要和 {@link ActivityIngestService} 搞混：
 * - Ingest：导入落库写入口，只给 CanonicalActivityMaterializer 用。
 * - Read：跨模块查询。不要在这里做 create/update。
 */
@Injectable()
export class ActivityReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按数字 id 查用户可见（READY）活动。
   */
  findReadyById(userId: string, activityId: number) {
    return this.prisma.activity.findFirst({
      where: readyActivityWhere({ id: activityId, userId }),
    });
  }

  /**
   * 按数字 id 解析 hashId，不加 READY 过滤。
   * 导入草稿提交后活动还在 ANALYZING，用 {@link findReadyById} 会查不到。
   */
  async findHashIdById(userId: string, activityId: number) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, userId },
      select: { hashId: true },
    });
    return activity?.hashId ?? null;
  }

  /**
   * 按 hashId 查用户可见（READY）活动。
   */
  findReadyByHashId(userId: string, hashId: string) {
    return this.prisma.activity.findFirst({
      where: readyActivityWhere({ userId, hashId }),
    });
  }

  /**
   * 透传 findFirst。调用方自己决定是否加 READY 谓词。
   */
  findFirst<T extends Prisma.ActivityFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.ActivityFindFirstArgs>,
  ) {
    return this.prisma.activity.findFirst(args);
  }

  /**
   * 透传 findUnique。调用方自己决定是否加 READY 谓词。
   */
  findUnique<T extends Prisma.ActivityFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ActivityFindUniqueArgs>,
  ) {
    return this.prisma.activity.findUnique(args);
  }

  /**
   * 透传 findMany。调用方自己决定是否加 READY 谓词。
   */
  findMany<T extends Prisma.ActivityFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.ActivityFindManyArgs>,
  ) {
    return this.prisma.activity.findMany(args);
  }

  /**
   * 返回 activity 表 accessor；传入 tx 时走同一事务。
   */
  activity(tx?: PrismaClientSlice<'activity'>) {
    return prismaModel(this.prisma, tx).activity;
  }

  /**
   * 透传 aggregate。
   */
  aggregate<T extends Prisma.ActivityAggregateArgs>(
    args: Prisma.Subset<T, Prisma.ActivityAggregateArgs>,
  ) {
    return this.prisma.activity.aggregate(args);
  }

  /**
   * 透传 count。
   */
  count<T extends Prisma.ActivityCountArgs>(
    args?: Prisma.Subset<T, Prisma.ActivityCountArgs>,
  ) {
    return this.prisma.activity.count(args);
  }

  /**
   * 统计一段时间内各运动类型的 READY 活动数量。
   *
   * 这是 Coach 判断“用户是否有明确主项”的服务端证据；调用方不应让模型
   * 根据对话上下文自行猜测，也不需要把原始活动列表加载进 Prompt。
   */
  async countReadyActivitiesBySportSince(
    userId: string,
    since: Date,
    sports: SportType[],
  ): Promise<Array<{ sportType: SportType; count: number }>> {
    if (sports.length === 0) return [];
    const rows = await this.prisma.activity.groupBy({
      by: ['sportType'],
      where: readyActivityWhere({
        userId,
        startTime: { gte: since },
        sportType: { in: sports },
      }),
      _count: { _all: true },
    });
    return rows.flatMap((row) =>
      row.sportType
        ? [{ sportType: row.sportType, count: row._count._all }]
        : [],
    );
  }

  /**
   * 给跨模块判断数据覆盖度使用的只读快照。
   *
   * 这里只报告活动事实和处理进度，不推断用户是否在休息，也不生成训练建议。
   */
  async dataCoverageSince(userId: string, since: Date) {
    const readyWhere = readyActivityWhere({
      userId,
      startTime: { gte: since },
    });
    const [readyCount, latestReady, sourceRows, processingRows] =
      await Promise.all([
        this.prisma.activity.count({ where: readyWhere }),
        this.prisma.activity.findFirst({
          where: readyActivityWhere({ userId }),
          orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
          select: { startTime: true, readyAt: true },
        }),
        this.prisma.activitySource.groupBy({
          by: ['sourceKind', 'provider'],
          where: {
            userId,
            isActive: true,
            activity: readyWhere,
          },
          _count: { _all: true },
          _max: { lastImportedAt: true },
        }),
        this.prisma.activity.groupBy({
          by: ['processingStatus'],
          where: {
            userId,
            state: 1,
            NOT: {
              OR: [
                { processingStatus: ActivityProcessingStatus.READY },
                { readyAt: { not: null } },
              ],
            },
          },
          _count: { _all: true },
        }),
      ]);

    return {
      readyCount,
      latestReadyAt:
        latestReady?.startTime?.toISOString() ??
        latestReady?.readyAt?.toISOString() ??
        null,
      bySource: sourceRows.map((row) => ({
        sourceKind: row.sourceKind as ImportSourceKind,
        provider: row.provider as ThirdPartyProvider | null,
        count: row._count._all,
        lastImportedAt: row._max.lastImportedAt?.toISOString() ?? null,
      })),
      processing: processingRows.map((row) => ({
        status: row.processingStatus,
        count: row._count._all,
      })),
    };
  }

  /**
   * 返回 activityZone 表 accessor；传入 tx 时走同一事务。
   */
  zones(tx?: PrismaClientSlice<'activityZone'>) {
    return prismaModel(this.prisma, tx).activityZone;
  }
}
