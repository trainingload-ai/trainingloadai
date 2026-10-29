import { describe, expect, it } from '@jest/globals';
import {
  decodeTrackFile,
  inspectTrackFile,
  transcodeTrackFile,
} from '../trackswap-file';

const gpx = Buffer.from(
  [
    '<gpx version="1.1" creator="server-test">',
    '<trk><name>门头沟区 跑步</name><type>running</type><trkseg>',
    '<trkpt lat="31.2" lon="121.4">',
    '<time>2026-07-20T00:00:00.000Z</time>',
    '</trkpt>',
    '</trkseg></trk></gpx>',
  ].join(''),
);

describe('TrackSwap server file boundary', () => {
  it('uses content detection and reports a misleading extension', async () => {
    const decoded = await decodeTrackFile(gpx, { filename: 'activity.fit' });

    expect(decoded.detectedFormat).toBe('gpx');
    expect(decoded.extensionFormat).toBe('fit');
    expect(decoded.extensionMismatch).toBe(true);
    expect(decoded.activity.activities?.[0]).toMatchObject({
      activityName: '门头沟区 跑步',
      sport: 'running',
    });
    expect(decoded.activity.activities?.[0]?.laps?.[0]?.records).toHaveLength(
      1,
    );
  });

  it('rejects a direction-specific source mismatch', async () => {
    await expect(
      transcodeTrackFile(gpx, 'tcx', {
        expectedFormat: 'fit',
        filename: 'activity.fit',
      }),
    ).rejects.toMatchObject({
      code: 'FORMAT_MISMATCH',
      details: { detectedFormat: 'gpx', expectedFormat: 'fit' },
    });
  });

  it('returns a safe inspection summary without native message payloads', async () => {
    const inspection = await inspectTrackFile(gpx, 'activity.gpx');

    expect(inspection).toMatchObject({
      format: 'gpx',
      kinds: ['activity'],
      extensionMismatch: false,
      activity: {
        activityCount: 1,
        lapCount: 1,
        recordCount: 1,
      },
    });
    expect(inspection).not.toHaveProperty('native');
  });
});
