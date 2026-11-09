import { describe, expect, it, jest } from '@jest/globals';
import { PlanExternalSyncService } from '@/api/plan/application/plan-external-sync.service';
describe('verified workout delivery mapping', () => {
  const args = {
    userId: 'owner',
    workoutId: 'local',
    revision: 4,
    provider: 'coros' as const,
    connectionId: 'c',
    accountId: 'a',
    externalId: 'library:remote',
    destination: 'library',
    localChecksum: 'local-hash',
    remoteChecksum: 'remote-hash',
    rawRemote: { course: { name: 'fixture' } },
    localContentVerified: true,
  };
  it.each([
    [4, 'SYNCED', true],
    [5, 'LOCAL_CHANGED', true],
    [null, 'LOCAL_DELETED', true],
    [4, 'CONFLICT', false],
  ] as const)(
    'preserves the delivered revision when the current revision is %s',
    async (revision, state, verified) => {
      const workouts = {
        findFirst: jest
          .fn<any>()
          .mockResolvedValue(
            revision === null ? null : { id: 'local', revision },
          ),
      };
      const links = { upsertMapping: jest.fn<any>().mockResolvedValue({}) };
      const service = new PlanExternalSyncService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        workouts as never,
        links as never,
        {} as never,
        {} as never,
      );
      const transaction = {} as never;
      await service.recordVerifiedDelivery(
        { ...args, localContentVerified: verified },
        transaction,
      );
      expect(links.upsertMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            planWorkoutId: revision === null ? null : 'local',
            syncState: state,
            lastLocalChecksum: 'local-hash',
            lastRemoteChecksum: 'remote-hash',
            metadata: expect.objectContaining({ workoutRevision: 4 }),
          }),
        }),
        transaction,
      );
    },
  );
});
