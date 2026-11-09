import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { PersonalFileSourceAdapter } from '@/importing/source-adapters/personal-file-source.adapter';
import * as trackFile from '@/importing/trackswap-file';

afterEach(() => jest.restoreAllMocks());
describe('personal file and metadata projection', () => {
  it('changes the canonical version for a metadata edit with identical FIT bytes', async () => {
    jest
      .spyOn(trackFile, 'decodeTrackFile')
      .mockResolvedValue({
        detectedFormat: 'fit',
        activity: {
          activities: [
            {
              sport: 'running',
              startTime: new Date('2026-10-31T16:00:00Z'),
              totalDistance: 1000,
              totalElapsedTime: 600,
              laps: [],
            },
          ],
        },
      } as never);
    const adapter = new PersonalFileSourceAdapter('GARMIN_PERSONAL_API');
    const input = {
      kind: 'GARMIN_PERSONAL_API',
      sourceUid: 'garmin:123:42',
      accountRef: '123',
      externalId: '42',
      sourceChecksum: 'same-original-file-sha256',
      activityFile: {
        buffer: Buffer.from('fixture'),
        originalname: 'fixture.fit',
      },
    };
    const original = {
      activityId: 42,
      activityName: 'Original',
      summaryDTO: { distance: 1000 },
    };
    const edited = {
      activityId: 42,
      activityName: 'Edited',
      summaryDTO: { distance: 1200 },
    };
    const normalize = (detail: object) =>
      adapter.normalize({
        ...input,
        rawPayload: detail,
        metadata: { remoteDetail: detail },
      } as never);
    const a = (await normalize(original)).payloads[0],
      b = (await normalize(edited)).payloads[0];
    expect(a.source.sourceUid).toBe(b.source.sourceUid);
    expect(a.source.sourceChecksum).not.toBe(b.source.sourceChecksum);
    expect(b.summary).toMatchObject({ name: 'Edited', distance: 1200 });
    expect(b.metadata?.rawFileChecksum).toBe('same-original-file-sha256');
    expect((await normalize(edited)).payloads[0].source.sourceChecksum).toBe(
      b.source.sourceChecksum,
    );
  });
});
