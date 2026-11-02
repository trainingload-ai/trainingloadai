import { randomUUID } from 'node:crypto';
import { RoutesService } from '../routes.service';
import { RoutesReadService } from '../routes-read.service';
function fixture() {
  let route: any = null;
  const versions: any[] = [],
    files = new Map<string, Buffer>();
  const match = (row: any, where: any) =>
    row &&
    (!where.id || row.id === where.id) &&
    (!where.userId || row.userId === where.userId) &&
    (!where.routeId || row.routeId === where.routeId) &&
    (!where.revision || row.revision === where.revision);
  const prisma: any = {
    savedRoute: {
      findUnique: jest.fn(async ({ where }: any) =>
        route?.userId === where.userId_requestId?.userId &&
        route?.requestId === where.userId_requestId?.requestId
          ? route
          : null,
      ),
      findFirst: jest.fn(async ({ where }: any) =>
        match(route, where) && !(where.deletedAt === null && route.deletedAt)
          ? route
          : null,
      ),
      create: jest.fn(
        async ({ data }: any) =>
          (route = {
            id: 'route',
            headRevision: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            ...data,
          }),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!match(route, where) || where.headRevision !== route.headRevision)
          return { count: 0 };
        Object.assign(route, data);
        return { count: 1 };
      }),
      delete: jest.fn(async () => {
        route = null;
        versions.length = 0;
      }),
    },
    savedRouteVersion: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          versions.find((row) => match(row, where)) ?? null,
      ),
      findMany: jest.fn(async () => versions),
      create: jest.fn(async ({ data }: any) => {
        const value = { id: randomUUID(), createdAt: new Date(), ...data };
        versions.push(value);
        return value;
      }),
    },
    routeExternalMapping: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    $queryRawUnsafe: jest.fn(async () => []),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const storage: any = {
    uploadFileWithCustomKey: jest.fn(async (file: any, key: string) => {
      files.set('private/' + key, Buffer.from(file.buffer));
      return { fileKey: 'private/' + key };
    }),
    getFileWithKey: jest.fn(async (key: string) => files.get(key)),
  };
  const garbage: any = { enqueueObjects: jest.fn(async () => {}) };
  const read = new RoutesReadService(prisma),
    service = new RoutesService(prisma, read, storage, garbage);
  const buffer = Buffer.from(
    '<gpx version="1.1"><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.001"/></trkseg></trk></gpx>',
  );
  const file = {
    buffer,
    size: buffer.length,
    originalname: 'route.gpx',
  } as Express.Multer.File;
  const body = {
    name: 'River route',
    sportCode: 'ROAD_RUNNING',
    requestId: randomUUID(),
  };
  return {
    service,
    read,
    prisma,
    storage,
    garbage,
    file,
    body,
    files,
    versions,
    get route() {
      return route;
    },
  };
}
describe('local route lifecycle', () => {
  it('makes import retries idempotent and never exposes storage keys to the client', async () => {
    const f = fixture(),
      first = await f.service.importGpx('a', f.body, f.file),
      again = await f.service.importGpx('a', f.body, f.file);
    expect(first.id).toBe(again.id);
    expect(f.storage.uploadFileWithCustomKey).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveProperty('rawStorageKey');
    await expect(
      f.service.importGpx('a', { ...f.body, name: 'Different' }, f.file),
    ).rejects.toThrow('ROUTE_REQUEST_CONFLICT');
  });
  it('keeps user ownership on all reads and original downloads', async () => {
    const f = fixture();
    await f.service.importGpx('a', f.body, f.file);
    await expect(f.read.detail('b', 'route')).rejects.toThrow(
      'ROUTE_NOT_FOUND',
    );
    await expect(f.service.original('b', 'route')).rejects.toThrow(
      'ROUTE_NOT_FOUND',
    );
    expect(f.storage.getFileWithKey).not.toHaveBeenCalled();
  });
  it('appends immutable revisions, retries a committed revision and rejects stale edits', async () => {
    const f = fixture();
    await f.service.importGpx('a', f.body, f.file);
    const body = {
      name: 'New name',
      sportCode: 'ROAD_RUNNING',
      expectedRevision: 1,
    };
    await f.service.importGpx('a', body, f.file, 'route');
    expect(f.versions.map((row) => row.revision)).toEqual([1, 2]);
    await f.service.importGpx('a', body, f.file, 'route');
    expect(f.storage.uploadFileWithCustomKey).toHaveBeenCalledTimes(2);
    await expect(
      f.service.importGpx(
        'a',
        { ...body, name: 'Stale change' },
        f.file,
        'route',
      ),
    ).rejects.toThrow('ROUTE_REVISION_CHANGED');
  });
  it('resolves a lost local commit response before creating another route or source file', async () => {
    const f = fixture();
    f.prisma.$transaction.mockImplementationOnce(async (fn: any) => {
      await fn(f.prisma);
      throw new Error('commit receipt lost');
    });
    await expect(
      f.service.importGpx('a', f.body, f.file),
    ).resolves.toMatchObject({ routeId: 'route' });
    expect(f.storage.uploadFileWithCustomKey).toHaveBeenCalledTimes(1);
  });
  it('verifies the original bytes before returning them', async () => {
    const f = fixture();
    await f.service.importGpx('a', f.body, f.file);
    expect(await f.service.original('a', 'route')).toEqual(f.file.buffer);
    f.files.set(f.versions[0].rawStorageKey, Buffer.from('corrupt'));
    await expect(f.service.original('a', 'route')).rejects.toThrow(
      'ROUTE_SOURCE_INTEGRITY_FAILED',
    );
  });
  it('retains tombstones while a remote delivery is unresolved', async () => {
    const f = fixture();
    await f.service.importGpx('a', f.body, f.file);
    f.prisma.routeExternalMapping.count.mockResolvedValue(1);
    expect(await f.service.remove('a', 'route', 1)).toEqual({
      deleted: true,
      pendingDeliveries: 1,
    });
    expect(f.route.deletedAt).toBeInstanceOf(Date);
    expect(f.prisma.savedRoute.delete).not.toHaveBeenCalled();
    expect(await f.read.detail('a', 'route')).toMatchObject({
      deletedAt: expect.any(Date),
    });
  });
});
