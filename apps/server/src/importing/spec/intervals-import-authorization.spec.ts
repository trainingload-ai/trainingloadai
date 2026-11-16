import { isMatch } from 'lodash';
import { ImportItemWorkerService } from '../import-item.worker';
import { IntervalsIcuApiError } from '@/integrations/intervals-icu/intervals-icu.client';
import { intervalsAuthorization } from '@/integrations/intervals-icu/intervals-icu-authorization';

function fixture() {
  let row: any = {
    id: 'connection',
    userId: 'user',
    status: 'ACTIVE',
    externalAthleteId: 'athlete-A',
    credentialCiphertext: 'key-A',
    credentialFingerprint: 'fingerprint-A',
    metadata: { authorizationRevision: 'grant-A' },
  };
  const job: any = {
    id: 'job',
    userId: 'user',
    sourceUid: 'source',
    sourceRef: {
      connectionId: 'connection',
      authorization: intervalsAuthorization(row),
    },
    sourceObject: {
      id: 'source',
      externalId: 'activity',
      accountRef: 'athlete-A',
      metadata: { connectionId: 'connection' },
    },
  };
  const download = jest.fn(async () => ({
    buffer: Buffer.from('FIT'),
    fileName: 'activity.fit',
  }));
  const updateMany = jest.fn(async ({ where, data }: any) => {
    if (!isMatch(row, where)) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  const worker = Object.create(ImportItemWorkerService.prototype) as any;
  Object.assign(worker, {
    externalConnections: {
      findActiveById: async (id: string, userId: string) =>
        row?.id === id && row.userId === userId && row.status === 'ACTIVE'
          ? row
          : null,
      model: () => ({ updateMany }),
    },
    intervalsIcuCredentials: {
      resolveConnectionCredential: (connection: any) =>
        connection.credentialCiphertext,
    },
    intervalsIcuClient: { downloadActivityFile: download },
    remoteActivityFiles: {
      resolve: async ({ download: resolve }: any) => ({
        ...(await resolve()),
        fileKey: 'stored',
        rawStorageKey: 'stored',
        sourceChecksum: 'hash',
      }),
    },
  });
  return {
    worker,
    job,
    download,
    updateMany,
    get row() {
      return row;
    },
    set row(v) {
      row = v;
    },
  };
}
describe('Intervals durable download authorization', () => {
  it('downloads through the original grant', async () => {
    const f = fixture();
    await f.worker.buildIntervalsIcuNormalizeInput(f.job);
    expect(f.download).toHaveBeenCalledWith('key-A', 'activity');
  });
  it.each([
    'other-account',
    'same-account-new-grant',
    'other-user',
    'revoked',
    'legacy-job',
  ])('does not borrow replacement credentials: %s', async (change) => {
    const f = fixture();
    if (change === 'other-account') f.row.externalAthleteId = 'athlete-B';
    if (change === 'same-account-new-grant')
      f.row.metadata.authorizationRevision = 'grant-B';
    if (change === 'other-user') f.row.userId = 'another-user';
    if (change === 'revoked') f.row.status = 'REVOKED';
    if (change === 'legacy-job') delete f.job.sourceRef.authorization;
    // Mutable source metadata cannot give an old queued job a new grant.
    f.job.sourceObject.metadata.authorization = intervalsAuthorization(f.row);
    await expect(
      f.worker.buildIntervalsIcuNormalizeInput(f.job),
    ).rejects.toThrow('INTERVALS_IMPORT_AUTHORIZATION_CHANGED');
    expect(f.download).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'does not invalidate a new grant after an old request returns 403 (same key: %s)',
    async (sameKey) => {
      const f = fixture();
      f.download.mockImplementationOnce(async () => {
        f.row = {
          ...f.row,
          credentialCiphertext: sameKey ? 'key-A' : 'key-B',
          metadata: { authorizationRevision: 'grant-B' },
        };
        throw new IntervalsIcuApiError(403, 'denied');
      });
      await expect(
        f.worker.buildIntervalsIcuNormalizeInput(f.job),
      ).rejects.toThrow();
      expect(f.row.status).toBe('ACTIVE');
      expect(f.row.credentialCiphertext).toBe(sameKey ? 'key-A' : 'key-B');
    },
  );
});
