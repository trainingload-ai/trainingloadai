jest.mock('../trackswap-file', () => ({ decodeTrackFile: jest.fn() }));
jest.mock('../activity-dataset-repair', () => ({
  ACTIVITY_MATERIALIZATION_VERSION: 2,
  datasetRepairFingerprint: () => 'fixture-fingerprint',
}));
jest.mock('../source-adapters/trackswap-canonical.mapper', () => ({
  mapTrackSwapActivityToCanonicalPayload: ({ sourceUid }) => ({
    source: { sourceUid: sourceUid + '#0' },
    identity: { sourceUid: sourceUid + '#0' },
  }),
}));
import { FitActivityDataRepairService } from '../fit-activity-data-repair.service';
import { decodeTrackFile } from '../trackswap-file';

function scanner() {
  const sources = ['a', 'b', 'c'].map((id) => ({
    id,
    userId: 'user',
    sourceUid: id,
    fileName: id + '.fit',
    sourceKind: 'FILE',
    rawStorageKey: id + '.fit',
    rawChecksum:
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    activitySources: [
      {
        id: 'primary-' + id,
        sourceUid: id + '#0',
        activityId: id.charCodeAt(0),
        metadata: { materializationVersion: 1 },
        activity: { parquetFiles: [], strengthExercises: [] },
      },
    ],
  }));
  const query = jest.fn(async ({ where, take }) =>
    sources.filter((s) => !where.id?.gt || s.id > where.id.gt).slice(0, take),
  );
  const service = new FitActivityDataRepairService(
    {} as never,
    { getFileWithKey: async () => Buffer.from('abc') } as never,
    {
      sourceObjects: () => ({ findMany: query }),
      itemJobs: () => ({ findFirst: async () => null }),
    } as never,
  );
  jest.mocked(decodeTrackFile).mockResolvedValue({
    detectedFormat: 'fit',
    activity: { activities: [{ laps: [{ records: [{}] }] }] },
  } as never);
  return { service, query };
}

describe('bounded raw-source repair pagination', () => {
  beforeEach(() => jest.resetAllMocks());

  it('does not declare completion when a full candidate page reaches the limit', async () => {
    const { service } = scanner();
    const first = await service.scan({ all: false, limit: 1 });
    expect(first.candidates.map((c) => c.sourceObjectId)).toEqual(['a']);
    expect(first.hasMore).toBe(true);
    const second = await service.scan({
      all: false,
      limit: 1,
      afterId: first.lastScannedId!,
    });
    expect(second.candidates.map((c) => c.sourceObjectId)).toEqual(['b']);
    expect(second.hasMore).toBe(true);
  });

  it('visits every source exactly once until a real terminal page', async () => {
    const { service } = scanner();
    const seen: string[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await service.scan({ all: false, limit: 1, afterId });
      seen.push(...result.candidates.map((c) => c.sourceObjectId));
      if (!result.hasMore) {
        expect(result.scanned).toBe(0);
        expect(seen).toEqual(['a', 'b', 'c']);
        return;
      }
      afterId = result.lastScannedId!;
    }
    throw new Error('Pagination did not terminate');
  });

  it('matches unbounded scan coverage', async () => {
    const { service } = scanner();
    const result = await service.scan({ all: true, limit: 1 });
    expect(result.candidates.map((c) => c.sourceObjectId)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(result.hasMore).toBe(false);
  });
});
