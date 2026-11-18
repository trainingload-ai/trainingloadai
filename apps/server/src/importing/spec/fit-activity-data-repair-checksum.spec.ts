jest.mock('../trackswap-file', () => ({ decodeTrackFile: jest.fn() }));

import { FitActivityDataRepairService } from '../fit-activity-data-repair.service';
import { fitSegmentChecksum } from '../raw-file-checksum';
import { decodeTrackFile } from '../trackswap-file';

const md5 = '900150983cd24fb0d6963f7d28e17f72';
const sha256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function scanner(rawChecksum: string, bytes = 'abc') {
  const source = {
    id: 'source-1',
    rawStorageKey: 'source.gpx',
    rawChecksum,
    activitySources: [],
  };
  const equivalentSources = jest.fn().mockResolvedValue([]);
  const service = new FitActivityDataRepairService(
    { activitySource: { findMany: equivalentSources } } as never,
    { getFileWithKey: async () => Buffer.from(bytes) } as never,
    {
      sourceObjects: () => ({ findMany: async () => [source] }),
      itemJobs: () => ({ findFirst: async () => null }),
    } as never,
  );
  return { service, source, equivalentSources };
}

describe('repair scanner source integrity', () => {
  beforeEach(() => jest.resetAllMocks());

  it.each([md5, sha256])(
    'continues scanning a non-FIT source with a valid stored digest %s',
    async (checksum) => {
      jest.mocked(decodeTrackFile).mockResolvedValueOnce({
        detectedFormat: 'gpx',
      } as never);
      const { service, source } = scanner(checksum);
      const result = await service.scan({
        all: false,
        limit: 1,
        failFast: true,
      });
      expect(result.failures).toEqual([]);
      expect(result.noRecoverableData).toBe(1);
      expect(decodeTrackFile).toHaveBeenCalledTimes(1);
      expect(source.rawChecksum).toBe(checksum);
    },
  );

  it.each([md5, sha256, 'malformed'])(
    'stops before decoding changed or unrecognized source digest %s',
    async (checksum) => {
      const { service } = scanner(checksum, 'altered');
      const result = await service.scan({
        all: false,
        limit: 1,
        failFast: true,
      });
      expect(result.failures).toEqual([
        { sourceObjectId: 'source-1', code: 'RAW_CHECKSUM_MISMATCH' },
      ]);
      expect(result.candidates).toEqual([]);
      expect(result.invalidFitFiles).toBe(0);
      expect(decodeTrackFile).not.toHaveBeenCalled();
    },
  );
});

describe('repair scanner discovery checksum compatibility', () => {
  beforeEach(() => jest.resetAllMocks());
  it('records observed file integrity separately from the legacy list digest', async () => {
    const checksum = '1'.repeat(40),
      { service, source } = scanner(checksum);
    Object.assign(source, {
      sourceKind: 'INTERVALS_ICU',
      provider: 'intervals_icu',
      objectType: 'third_party_activity_file',
      metadata: { listChecksum: checksum },
      activitySources: [{ sourceChecksum: null }],
    });
    jest
      .mocked(decodeTrackFile)
      .mockResolvedValueOnce({ detectedFormat: 'gpx' } as never);
    const result = await service.scan({ all: false, limit: 1, failFast: true });
    expect(result.failures).toEqual([]);
    expect(result.integrityAudits).toEqual([
      {
        sourceObjectId: source.id,
        basis: 'LEGACY_DISCOVERY_CHECKSUM',
        registeredDiscoveryChecksum: checksum,
        observedFileSha256: sha256,
        fileChecksumStatus: 'OBSERVED_LEGACY_FILE',
      },
    ]);
    expect(source.rawChecksum).toBe(checksum);
  });
  it('does not reclassify a checksum once a primary file identity is registered', async () => {
    const checksum = '1'.repeat(40),
      { service, source } = scanner(checksum);
    Object.assign(source, {
      sourceKind: 'INTERVALS_ICU',
      provider: 'intervals_icu',
      objectType: 'third_party_activity_file',
      metadata: { listChecksum: checksum },
      activitySources: [{ sourceChecksum: 'registered-raw-file' }],
    });
    const result = await service.scan({ all: false, limit: 1, failFast: true });
    expect(result.failures).toEqual([
      { sourceObjectId: source.id, code: 'RAW_CHECKSUM_MISMATCH' },
    ]);
    expect(result.integrityAudits).toEqual([]);
    expect(decodeTrackFile).not.toHaveBeenCalled();
  });

  it('fences each multipart repair using the same digest as its canonical payload', async () => {
    const { service, source } = scanner(sha256);
    const sessions = [0, 1].map((index) => {
      const time = new Date(Date.UTC(2026, 1, 1, index));
      return {
        sport: 'cycling',
        startTime: time,
        laps: [{ records: [{ timestamp: time, heartRate: 120 }] }],
      };
    });
    Object.assign(source, {
      sourceKind: 'FILE',
      sourceUid: 'file',
      fileName: 'source.fit',
      activitySources: sessions.map(({ startTime }, index) => ({
        id: `link-${index}`,
        sourceUid: `file#${index}`,
        activityId: index + 1,
        metadata: {},
        activity: { startTime, parquetFiles: [], strengthExercises: [] },
      })),
    });
    jest.mocked(decodeTrackFile).mockResolvedValueOnce({
      detectedFormat: 'fit',
      activity: { activities: sessions },
    } as never);
    const result = await service.scan({ all: false, limit: 1, failFast: true });
    expect(result.failures).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    const [candidate] = result.candidates;
    for (const [index, payload] of candidate.payloads.entries()) {
      expect(candidate.repairs?.[payload.source.sourceUid].sourceChecksum).toBe(
        fitSegmentChecksum(sha256, index),
      );
      expect(payload.source.sourceChecksum).toBe(
        candidate.repairs?.[payload.source.sourceUid].sourceChecksum,
      );
    }
    expect(candidate.payloads).toHaveLength(2);
  });

  it.each([
    [true, false],
    [true, true],
    [false, false],
  ])(
    'requires matching start time (%s) and ignores a discarded record tail (%s)',
    async (sameStart, damagedTail) => {
      const { service, source, equivalentSources } = scanner(sha256);
      const times = [
        new Date('2026-01-01T08:00:00Z'),
        new Date('2026-01-01T08:30:00Z'),
      ];
      Object.assign(source, {
        sourceKind: 'FILE',
        sourceUid: 'file',
        fileName: 'source.fit',
        activitySources: [
          {
            id: 'link',
            sourceUid: 'file#0',
            activityId: 1,
            metadata: { materializationVersion: 2 },
            activity: {
              startTime: times[0],
              parquetFiles: [{ type: 'record', pointCount: 1 }],
              strengthExercises: [],
            },
          },
        ],
      });
      equivalentSources.mockResolvedValueOnce([
        {
          sourceUid: 'equivalent#1',
          sourceChecksum: fitSegmentChecksum(sha256, 1),
          sourceObject: { sourceUid: 'equivalent' },
          metadata: { containerChecksum: sha256, materializationVersion: 2 },
          activityId: 2,
          activity: {
            startTime: sameStart ? times[1] : times[0],
            parquetFiles: [{ pointCount: 1 }],
            strengthExercises: [],
          },
        },
      ]);
      jest.mocked(decodeTrackFile).mockResolvedValueOnce({
        detectedFormat: 'fit',
        activity: {
          activities: times.map((time, index) => ({
            startTime: time,
            laps: [
              {
                records: [
                  { timestamp: time, heartRate: 120 },
                  ...(damagedTail && index === 1
                    ? [
                        {
                          timestamp: new Date(time.getTime() - 1000),
                          heartRate: 120,
                        },
                      ]
                    : []),
                ],
              },
            ],
          })),
        },
      } as never);
      const result = await service.scan({
        all: false,
        limit: 1,
        failFast: true,
      });
      expect(result.candidates).toEqual([]);
      expect(result.failures).toEqual(
        sameStart
          ? []
          : [
              {
                sourceObjectId: source.id,
                code: 'RAW_ACTIVITY_ASSOCIATION_MISSING',
              },
            ],
      );
    },
  );
});
