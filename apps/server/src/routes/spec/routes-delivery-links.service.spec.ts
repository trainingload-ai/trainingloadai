import {
  RoutesDeliveryLinksService,
  type RouteDeliveryReceipt,
} from '../routes-delivery-links.service';
function fixture() {
  const mapping = {
    id: 'mapping',
    createdByApplication: true,
    state: 'ACCEPTED',
    externalId: 'remote',
    metadata: { lastTaskId: 'old' },
  };
  const prisma: any = {
    savedRoute: {
      findFirst: jest.fn(async () => ({
        id: 'route',
        userId: 'a',
        headRevision: 2,
        deletedAt: null,
      })),
    },
    savedRouteVersion: {
      findFirst: jest.fn(async () => ({ id: 'v2', revision: 2 })),
    },
    routeExternalMapping: {
      findUnique: jest.fn(async () => mapping),
      upsert: jest.fn(async (args: any) => args.update),
    },
    $queryRawUnsafe: jest.fn(async () => []),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const connection = {
    id: 'conn',
    userId: 'a',
    provider: 'garmin',
    externalAthleteId: 'account',
    status: 'ACTIVE',
  };
  const connections: any = {
      model: jest.fn(() => ({ findUnique: jest.fn(async () => connection) })),
    },
    inbox: any = { isCurrentClaim: jest.fn(async () => true) };
  const input: RouteDeliveryReceipt = {
    userId: 'a',
    routeId: 'route',
    versionId: 'v2',
    provider: 'garmin',
    connectionId: 'conn',
    accountRef: 'account',
    externalId: 'remote',
    state: 'ACCEPTED',
    intent: 'PUBLISH',
    localChecksum: 'a'.repeat(64),
    metadata: { verification: 'RECEIPT_ONLY', lastTaskId: 'task' },
    claim: { id: 'task', attempts: 1, lockedAt: new Date() },
  };
  return {
    service: new RoutesDeliveryLinksService(prisma, connections, inbox),
    prisma,
    connection,
    mapping,
    inbox,
    input,
  };
}
describe('provider-neutral route delivery mappings', () => {
  it('saves acceptance without claiming readback or exposing a raw vendor payload', async () => {
    const f = fixture();
    expect(await f.service.record(f.input)).toMatchObject({
      state: 'ACCEPTED',
      lastRemoteChecksum: null,
      metadata: { verification: 'RECEIPT_ONLY' },
    });
    await expect(
      f.service.record({
        ...f.input,
        metadata: { ...f.input.metadata, token: 'secret' } as any,
      }),
    ).rejects.toThrow();
  });
  it('rejects stale claims and does not write a mapping', async () => {
    const f = fixture();
    f.inbox.isCurrentClaim.mockResolvedValue(false);
    await expect(f.service.record(f.input)).rejects.toThrow(
      'ROUTE_DELIVERY_LEASE_LOST',
    );
    expect(f.prisma.routeExternalMapping.upsert).not.toHaveBeenCalled();
  });
  it('rejects another account or user and a changed remote identity', async () => {
    const f = fixture();
    f.connection.userId = 'other';
    await expect(f.service.record(f.input)).rejects.toThrow(
      'ROUTE_DELIVERY_OWNER_CHANGED',
    );
    f.connection.userId = 'a';
    await expect(
      f.service.record({ ...f.input, externalId: 'another' }),
    ).rejects.toThrow('ROUTE_REMOTE_ID_CHANGED');
  });
  it('requires evidence for verified/deleted states and protects resources created elsewhere', async () => {
    const f = fixture();
    await expect(
      f.service.record({ ...f.input, state: 'VERIFIED' }),
    ).rejects.toThrow('ROUTE_DELIVERY_EVIDENCE_REQUIRED');
    await expect(
      f.service.record({
        ...f.input,
        state: 'REMOTE_DELETED',
        intent: 'REMOVE',
      }),
    ).rejects.toThrow('ROUTE_DELIVERY_EVIDENCE_REQUIRED');
    f.mapping.createdByApplication = false;
    await expect(f.service.record(f.input)).rejects.toThrow(
      'ROUTE_REMOTE_RESOURCE_NOT_OWNED',
    );
  });
  it('does not start a new publish from an obsolete revision, revoked connection or unresolved write', async () => {
    const f = fixture();
    f.mapping.state = 'UNKNOWN';
    await expect(
      f.service.record({ ...f.input, state: 'PENDING' }),
    ).rejects.toThrow('ROUTE_DELIVERY_UNRESOLVED');
    f.mapping.state = 'ACCEPTED';
    f.connection.status = 'REVOKED';
    await expect(
      f.service.record({ ...f.input, state: 'PENDING' }),
    ).rejects.toThrow('ROUTE_LOCAL_VERSION_CHANGED');
    f.connection.status = 'ACTIVE';
    f.prisma.savedRoute.findFirst.mockResolvedValue({ headRevision: 3 });
    await expect(
      f.service.record({ ...f.input, state: 'PENDING' }),
    ).rejects.toThrow('ROUTE_LOCAL_VERSION_CHANGED');
  });
});
