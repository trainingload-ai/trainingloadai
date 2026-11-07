import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFITActivityRecordParity,
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
  it('rejects a FIT document when canonicalization drops decoded records', () => {
    expect(() =>
      assertFITActivityRecordParity({
        detectedFormat: 'fit',
        document: {
          schemaVersion: '2',
          format: 'fit',
          kinds: ['activity'],
          source: { byteLength: 100 },
          metadata: {},
          facets: {},
          diagnostics: {
            durationMs: 1,
            warnings: [],
            fit: {
              parserVersion: 'test',
              messageCounts: { recordMesgs: 2 },
              recognizedMessageCounts: {},
              unknownMessageCounts: {},
              invalidValueCounts: {},
              warningCounts: {},
              warnings: [],
            },
          },
        },
        activity: {
          metadata: { originType: 'FIT', fileType: 'fit' },
          activities: [
            {
              index: 0,
              laps: [
                {
                  index: 0,
                  records: [{ index: 0, lapIndex: 0 }],
                  lengths: [],
                },
              ],
            },
          ],
        },
        filename: 'activity.fit',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'ACTIVITY_RECORD_COUNT_MISMATCH',
        details: expect.objectContaining({
          decodedRecordCount: 2,
          canonicalRecordCount: 1,
        }),
      }),
    );
  });

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

  it('preserves indoor TCX heart rate and reports unsupported cadence', async () => {
    const input = fitFixture('indoor');
    const source = await decodeTrackFile(input);
    const { content, report } = await transcodeTrackFile(input, 'tcx');
    const decoded = await decodeTrackFile(content, { filename: 'indoor.tcx' });
    const heartRates = (activity: typeof source.activity) =>
      (activity.activities ?? []).flatMap((session) =>
        (session.laps ?? []).flatMap((lap) =>
          (lap.records ?? []).map((record) => record.heartRate),
        ),
      );
    const expectedHeartRates = heartRates(source.activity);
    expect(expectedHeartRates).toHaveLength(2);
    expect(expectedHeartRates.every((value) => Number(value) > 0)).toBe(true);
    expect(heartRates(decoded.activity)).toEqual(expectedHeartRates);
    expect(report.outputRecords).toBe(2);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        code: 'METRICS_NOT_PRESERVED',
        metrics: ['cadence'],
      }),
    );
  });

  it('preserves coordinates when encoding an activity as FIT', async () => {
    const { content, report } = await transcodeTrackFile(gpx, 'fit');

    expect(report).toMatchObject({
      sourceFormat: 'gpx',
      inputRecords: 1,
      outputRecords: 1,
      warnings: [],
    });
    await expect(inspectTrackFile(content)).resolves.toMatchObject({
      format: 'fit',
      activity: {
        recordCount: 1,
        coordinateCount: 1,
      },
    });
  });
});
