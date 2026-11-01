import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// Small synthetic activity files encoded with Garmin's official SDK. No user data.
const fitFixture = (kind: string) =>
  readFileSync(join(__dirname, 'fixtures', `conversion-${kind}.fit`));

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
        coordinateCount: 1,
      },
    });
    expect(inspection).not.toHaveProperty('native');
  });

  it('rejects an indoor FIT instead of returning an empty GPX', async () => {
    const input = fitFixture('indoor');
    const inspection = await inspectTrackFile(input);
    expect(inspection.activity).toMatchObject({
      recordCount: 2,
      coordinateCount: 0,
    });
    await expect(transcodeTrackFile(input, 'gpx')).rejects.toMatchObject({
      code: 'GPX_COORDINATES_REQUIRED',
    });
  });

  it('verifies real GPS FIT coordinates and preserves both points', async () => {
    const { content, report } = await transcodeTrackFile(
      fitFixture('gps'),
      'gpx',
    );
    expect(content.toString()).toContain('lat="31.2" lon="121.4"');
    expect(report).toMatchObject({
      sourceFormat: 'fit',
      inputRecords: 2,
      outputRecords: 2,
    });
    expect(report.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'POINTS_OMITTED' }),
    );
  });

  it('reports the exact point loss for a FIT with partial GPS coverage', async () => {
    const { report } = await transcodeTrackFile(
      fitFixture('partial-gps'),
      'gpx',
    );
    expect(report.warnings).toContainEqual({
      code: 'POINTS_OMITTED',
      count: 1,
      total: 2,
    });
    expect(report.outputRecords).toBe(1);
  });

  it('keeps indoor TCX records and reports metrics that fail the round-trip check', async () => {
    const { report } = await transcodeTrackFile(fitFixture('indoor'), 'tcx');
    expect(report.outputRecords).toBe(2);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: 'METRICS_NOT_PRESERVED',
        metrics: expect.arrayContaining(['heartRate', 'cadence']),
      }),
    );
  });

  it('blocks the known coordinate corruption in TrackSwap 0.2.2 FIT activity encoding', async () => {
    await expect(transcodeTrackFile(gpx, 'fit')).rejects.toMatchObject({
      code: 'OUTPUT_INVALID',
    });
  });
});
