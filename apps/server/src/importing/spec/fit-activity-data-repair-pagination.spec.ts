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

function scanner(ids = ['a', 'b', 'c']) {
  const sources = ids.map((id) => ({
    id,
    userId: 'user',
    sourceUid: id,
    fileName: id + '.fit',
    importRevision: `consumed-${id}`,
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
  const query = jest.fn(async ({ where, take, select }) => {
    let rows = sources.filter((source) => {
      if (where?.id?.in) return where.id.in.includes(source.id);
      return !where?.id?.gt || source.id > where.id.gt;
    });
    // A joined activity/parquet select must not be what decides the page end.
    // Returning a short parent page here used to look like exhaustion near 25.
    if (select?.activitySources && !where?.id?.in) {
      return rows.slice(0, Math.min(take ?? rows.length, 20));
    }
    if (typeof take === 'number') rows = rows.slice(0, take);
    return rows;
  });
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

  it('captures the scanned source revision before any later source input is registered', async () => {
    const { service } = scanner();
    const scanned = await service.scan({ all: false, limit: 1 });
    expect(scanned.candidates[0].sourceRevision).toBe('consumed-a');
  });
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

  it('continues past a full migration page when a joined read would stop short', async () => {
    const ids = Array.from({ length: 30 }, (_, index) =>
      String(index).padStart(2, '0'),
    );
    const { service } = scanner(ids);
    const seen: string[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const result = await service.scan({ all: false, limit: 25, afterId });
      seen.push(...result.candidates.map((candidate) => candidate.sourceObjectId));
      if (!result.hasMore) {
        expect(seen).toEqual(ids);
        expect(result.sourceOutcomes.map((outcome) => outcome.sourceObjectId)).toEqual(
          ids.slice(25),
        );
        return;
      }
      expect(result.scanned).toBe(25);
      afterId = result.lastScannedId!;
    }
    throw new Error('Pagination stopped at the page boundary');
  });

  it('keeps scanning non-repair sources after a joined page would look finished', async () => {
    const ids = Array.from({ length: 30 }, (_, index) =>
      String(index).padStart(2, '0'),
    );
    const { service } = scanner(ids);
    jest.mocked(decodeTrackFile).mockResolvedValue({
      detectedFormat: 'gpx',
    } as never);
    const seen: string[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const result = await service.scan({ all: false, limit: 25, afterId });
      expect(result.candidates).toEqual([]);
      seen.push(...result.sourceOutcomes.map((outcome) => outcome.sourceObjectId));
      if (!result.hasMore) {
        expect(seen).toEqual(ids);
        expect(result.sourceOutcomes.every((outcome) => outcome.disposition === 'NO_RECOVERABLE_DATA')).toBe(true);
        return;
      }
      expect(result.scanned).toBe(25);
      afterId = result.lastScannedId!;
    }
    throw new Error('Non-repair pagination stopped at the page boundary');
  });

  it('hard-fails when the cursor does not advance', async () => {
    const { service, query } = scanner();
    query.mockImplementation(async () => [{ id: 'a' }]);
    await expect(service.scan({ all: false, limit: 25, afterId: 'a' })).rejects.toThrow(
      'RAW_SCAN_CURSOR_STALLED',
    );
  });
});
