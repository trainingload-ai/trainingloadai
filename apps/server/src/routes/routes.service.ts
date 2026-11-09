import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ROUTE_SPORT_CODES } from '@shared/routes';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { StorageObjectGarbageCollectorService } from '../sensor/parquet-garbage-collector.service';
import { RoutesReadService } from './routes-read.service';
import { parseRouteGpx, ROUTE_LIMITS } from './route-geometry';
const input = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000).default(''),
    sportCode: z.enum(ROUTE_SPORT_CODES),
    requestId: z.string().uuid().optional(),
    expectedRevision: z.coerce.number().int().positive().optional(),
  })
  .strict();
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: RoutesReadService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly garbage: StorageObjectGarbageCollectorService,
  ) {}
  async importGpx(
    userId: string,
    body: unknown,
    file: Express.Multer.File | undefined,
    routeId?: string,
  ) {
    const parsed = input.safeParse(body);
    if (
      !parsed.success ||
      !file?.buffer ||
      file.size !== file.buffer.length ||
      file.size > ROUTE_LIMITS.bytes ||
      !file.originalname.toLowerCase().endsWith('.gpx')
    )
      throw new BadRequestException('ROUTE_IMPORT_INVALID');
    const data = parsed.data;
    if (routeId ? !data.expectedRevision : !data.requestId)
      throw new BadRequestException('ROUTE_REVISION_REQUIRED');
    let gpx: ReturnType<typeof parseRouteGpx>;
    try {
      gpx = parseRouteGpx(file.buffer);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'ROUTE_GPX_INVALID',
      );
    }
    const checksum = hash({
      name: data.name,
      description: data.description,
      sportCode: data.sportCode,
      rawChecksum: gpx.checksum,
    });
    if (!routeId) {
      const existing = await this.prisma.savedRoute.findUnique({
        where: { userId_requestId: { userId, requestId: data.requestId! } },
      });
      if (existing) {
        if (existing.creationChecksum !== checksum || existing.deletedAt)
          throw new ConflictException('ROUTE_REQUEST_CONFLICT');
        return this.read.detail(userId, existing.id);
      }
    }
    if (routeId) {
      const current = await this.read.version(userId, routeId);
      if (
        current.version.checksum === checksum &&
        data.expectedRevision! <= current.route.headRevision
      )
        return this.read.detail(userId, routeId);
      if (current.route.headRevision !== data.expectedRevision)
        throw new ConflictException('ROUTE_REVISION_CHANGED');
    }
    const key = `route-sources/${randomUUID()}.gpx`;
    // Register a canonical private key first, so a crash during upload cannot strand a file.
    await this.garbage.enqueueObjects(
      [{ objectKey: key, bucket: 'private' }],
      'route_upload_staging',
      24 * 3600000,
    );
    const stored = await this.storage.uploadFileWithCustomKey(
      file,
      key,
      'private',
    );
    const version = {
      name: data.name,
      description: data.description,
      sportCode: data.sportCode,
      geometry: gpx.geometry as unknown as Prisma.InputJsonObject,
      distanceMeters: gpx.distanceMeters,
      elevationGainMeters: gpx.elevationGainMeters,
      elevationLossMeters: gpx.elevationLossMeters,
      pointCount: gpx.pointCount,
      segmentCount: gpx.segmentCount,
      hasCompleteElevation: gpx.hasCompleteElevation,
      rawStorageKey: stored.fileKey,
      rawSize: file.size,
      rawChecksum: gpx.checksum,
      checksum,
    };
    let id = routeId;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        if (!routeId) {
          const route = await tx.savedRoute.create({
            data: {
              userId,
              requestId: data.requestId!,
              creationChecksum: checksum,
            },
          });
          await tx.savedRouteVersion.create({
            data: { ...version, userId, routeId: route.id, revision: 1 },
          });
          return route.id;
        }
        const revision = data.expectedRevision! + 1;
        const changed = await tx.savedRoute.updateMany({
          where: {
            id: routeId,
            userId,
            headRevision: data.expectedRevision,
            deletedAt: null,
          },
          data: { headRevision: revision },
        });
        if (changed.count !== 1)
          throw new ConflictException('ROUTE_REVISION_CHANGED');
        await tx.savedRouteVersion.create({
          data: { ...version, userId, routeId, revision },
        });
        return routeId;
      });
    } catch (error) {
      // A lost commit response is resolved from local durable state before surfacing failure.
      const existing = routeId
        ? await this.prisma.savedRoute.findFirst({
            where: { id: routeId, userId, deletedAt: null },
          })
        : await this.prisma.savedRoute.findUnique({
            where: { userId_requestId: { userId, requestId: data.requestId! } },
          });
      if (existing && !existing.deletedAt) {
        const saved = await this.read.version(userId, existing.id);
        if (saved.version.checksum === checksum)
          return this.read.detail(userId, existing.id);
      }
      throw error;
    }
    return this.read.detail(userId, id!);
  }
  async original(userId: string, routeId: string, revision?: number) {
    const { version } = await this.read.version(userId, routeId, revision);
    const bytes = await this.storage.getFileWithKey(
      version.rawStorageKey,
      'private',
    );
    if (
      bytes.length !== version.rawSize ||
      createHash('sha256').update(bytes).digest('hex') !== version.rawChecksum
    )
      throw new ConflictException('ROUTE_SOURCE_INTEGRITY_FAILED');
    return bytes;
  }
  async remove(userId: string, routeId: string, expectedRevision: number) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw new BadRequestException('ROUTE_REVISION_REQUIRED');
    const route = await this.prisma.savedRoute.findFirst({
      where: { id: routeId, userId },
    });
    if (!route) throw new NotFoundException('ROUTE_NOT_FOUND');
    const changed = await this.prisma.savedRoute.updateMany({
      where: { id: routeId, userId, headRevision: expectedRevision },
      data: { deletedAt: route.deletedAt ?? new Date() },
    });
    if (changed.count !== 1)
      throw new ConflictException('ROUTE_REVISION_CHANGED');
    const pending = await this.prisma.routeExternalMapping.count({
      where: {
        routeId,
        userId,
        NOT: {
          OR: [
            { state: 'REMOTE_DELETED' },
            { state: 'REJECTED', externalId: null },
          ],
        },
      },
    });
    if (!pending) await this.purgeDeleted(userId, routeId);
    return { deleted: true, pendingDeliveries: pending };
  }
  async purgeDeleted(userId: string, routeId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM t_saved_route WHERE id=$1 AND user_id=$2 FOR UPDATE',
        routeId,
        userId,
      );
      const route = await tx.savedRoute.findFirst({
        where: { id: routeId, userId, deletedAt: { not: null } },
      });
      if (!route) return;
      const pending = await tx.routeExternalMapping.count({
        where: {
          routeId,
          userId,
          NOT: {
            OR: [
              { state: 'REMOTE_DELETED' },
              { state: 'REJECTED', externalId: null },
            ],
          },
        },
      });
      if (pending) return;
      const files = await tx.savedRouteVersion.findMany({
        where: { routeId, userId },
        select: { rawStorageKey: true },
      });
      await this.garbage.enqueueObjects(
        files.map((row) => ({
          objectKey: row.rawStorageKey.replace(/^private\//, ''),
          bucket: 'private',
        })),
        'route_deleted',
        3600000,
        tx,
      );
      await tx.savedRoute.delete({ where: { id: routeId } });
    });
  }
}
