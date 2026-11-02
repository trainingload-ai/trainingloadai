import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { routePreviewGeometry, type RouteGeometry } from './route-geometry';

@Injectable()
export class RoutesReadService {
  constructor(private readonly prisma: PrismaService) {}
  async version(
    userId: string,
    routeId: string,
    revision?: number,
    includeDeleted = false,
  ) {
    const route = await this.prisma.savedRoute.findFirst({
      where: {
        id: routeId,
        userId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
    if (!route) throw new NotFoundException('ROUTE_NOT_FOUND');
    const version = await this.prisma.savedRouteVersion.findFirst({
      where: { routeId, userId, revision: revision ?? route.headRevision },
    });
    if (!version) throw new NotFoundException('ROUTE_VERSION_NOT_FOUND');
    return { route, version };
  }
  async detail(userId: string, routeId: string) {
    const { route, version } = await this.version(
      userId,
      routeId,
      undefined,
      true,
    );
    const { geometry, rawStorageKey: _key, ...facts } = version;
    return {
      ...facts,
      id: route.id,
      versionId: version.id,
      routeId: route.id,
      geometry: routePreviewGeometry(geometry as unknown as RouteGeometry),
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
      deletedAt: route.deletedAt,
      deliveries: await this.prisma.routeExternalMapping.findMany({
        where: { routeId, userId },
        select: {
          id: true,
          provider: true,
          state: true,
          versionId: true,
          updatedAt: true,
        },
      }),
    };
  }
  async list(userId: string, cursor?: string) {
    const rows = await this.prisma.savedRoute.findMany({
      where: {
        userId,
        OR: [
          { deletedAt: null },
          {
            externalMappings: {
              some: {
                NOT: {
                  OR: [
                    { state: 'REMOTE_DELETED' },
                    { state: 'REJECTED', externalId: null },
                  ],
                },
              },
            },
          },
        ],
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 51,
      include: {
        versions: {
          orderBy: { revision: 'desc' },
          take: 1,
          select: {
            name: true,
            sportCode: true,
            revision: true,
            distanceMeters: true,
            elevationGainMeters: true,
            pointCount: true,
            segmentCount: true,
          },
        },
      },
    });
    return {
      items: rows.slice(0, 50).map(({ versions, ...route }) => ({
        ...route,
        ...versions[0],
        requestId: undefined,
        creationChecksum: undefined,
      })),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }
  async listStorageKeysForUser(userId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).savedRouteVersion.findMany({
      where: { userId },
      select: { rawStorageKey: true },
    });
  }
  async exportData(userId: string, cutoff: Date) {
    const routes = await this.prisma.savedRoute.findMany({
      where: { userId, createdAt: { lte: cutoff } },
      orderBy: { id: 'asc' },
    });
    const versions = await this.prisma.savedRouteVersion.findMany({
      where: { userId, createdAt: { lte: cutoff } },
      orderBy: [{ routeId: 'asc' }, { revision: 'asc' }],
    });
    return { routes, versions };
  }
  async existsByStorageKey(key: string) {
    const canonical = key.replace(/^private\//, '');
    return Boolean(
      await this.prisma.savedRouteVersion.findFirst({
        where: { rawStorageKey: { in: [canonical, `private/${canonical}`] } },
        select: { id: true },
      }),
    );
  }
}
