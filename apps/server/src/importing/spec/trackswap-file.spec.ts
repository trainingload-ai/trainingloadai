import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trackFileRecords } from '../track-file-conversion';
import { mapTrackFileRequestError } from '../track-file-request-error';
import {
  assertFITActivityRecordParity,
  decodeTrackFile,
  encodeTrackCourse,
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

// Small synthetic FIT files encoded with Garmin's official SDK. No user data.
// The course has a valid 12-byte header so the test detects a raw file copy.
// Two local record definitions contain the same fields in different orders.
const fitFixture = (kind: string) =>
  readFileSync(join(__dirname, 'fixtures', `conversion-${kind}.fit`));

const sampleTimes = [0, 10, 20].map((second) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
);
const multiPointGpx = Buffer.from(
  '<gpx version="1.1" creator="synthetic-test"><trk><type>running</type><trkseg>' +
    sampleTimes
      .map(
        (time, index) =>
          `<trkpt lat="${31.2 + index * 0.0001}" lon="121.4"><time>${time}</time></trkpt>`,
      )
      .join('') +
    '</trkseg></trk></gpx>',
);
const metricTcx = (gps: boolean) =>
  Buffer.from(
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running">' +
      `<Id>${sampleTimes[0]}</Id><Lap StartTime="${sampleTimes[0]}"><TotalTimeSeconds>20</TotalTimeSeconds><DistanceMeters>200</DistanceMeters><Track>` +
      sampleTimes
        .map(
          (time, index) =>
            `<Trackpoint><Time>${time}</Time>` +
            (gps
              ? `<Position><LatitudeDegrees>${31.2 + index * 0.0001}</LatitudeDegrees><LongitudeDegrees>121.4</LongitudeDegrees></Position>`
              : '') +
            `<DistanceMeters>${index * 100}</DistanceMeters></Trackpoint>`,
        )
        .join('') +
      '</Track></Lap></Activity></Activities></TrainingCenterDatabase>',
  );

const serverDirectory = join(__dirname, '../../..');

function readFitCourse(content: Buffer) {
  const json = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { readFileSync } from 'node:fs';
       import { Decoder, Profile, Stream } from '@garmin/fitsdk';
       const decoder = new Decoder(Stream.fromBuffer(readFileSync(0)));
       const integrity = decoder.checkIntegrity();
       const navigationOrder = [];
       const { messages, errors } = decoder.read({
         mesgListener: (id) => {
           if (id === Profile.MesgNum.RECORD) navigationOrder.push('record');
           if (id === Profile.MesgNum.COURSE_POINT) navigationOrder.push('cue');
         },
       });
       console.log(JSON.stringify({
         integrity, errors: errors.length, type: messages.fileIdMesgs[0].type,
         records: messages.recordMesgs, cues: messages.coursePointMesgs ?? [],
         courses: messages.courseMesgs, laps: messages.lapMesgs, events: messages.eventMesgs,
         navigationOrder,
       }));`,
    ],
    { input: content, encoding: 'utf8', cwd: serverDirectory },
  );
  return JSON.parse(json) as {
    integrity: boolean;
    errors: number;
    type: string;
    navigationOrder: string[];
    cues: Array<{ name: string; type: string; messageIndex: number }>;
    courses?: Array<{ name: string; sport: string }>;
    laps?: Array<{ totalDistance: number }>;
    events?: Array<{ event: string; eventType: string }>;
    records: Array<{
      timestamp: string;
      positionLat: number;
      positionLong: number;
      distance?: number;
      speed?: number;
    }>;
  };
}

describe('TrackSwap server file boundary', () => {
  it('re-encodes an existing FIT Course without changing route records or cues', async () => {
    const input = fitFixture('course-with-cues');
    const source = readFitCourse(input);
    expect(source).toMatchObject({
      integrity: true,
      errors: 0,
      type: 'course',
      navigationOrder: ['record', 'record', 'cue', 'record', 'cue', 'record'],
      courses: [{ name: 'Synthetic switchbacks', sport: 'cycling' }],
      laps: [{ totalDistance: 38.75 }],
      events: [
        { event: 'timer', eventType: 'start' },
        { event: 'timer', eventType: 'stopAll' },
      ],
      cues: [
        { messageIndex: 0, type: 'left', name: 'Left turn' },
        { messageIndex: 1, type: 'food', name: 'Aid station' },
      ],
    });
    expect(source.records).toHaveLength(4);
    const reencoded = await encodeTrackCourse(input);
    expect(reencoded).not.toEqual(input);
    expect(readFitCourse(reencoded)).toEqual(source);
  });

  it('rejects a FIT Course with a damaged file checksum', async () => {
    const input = fitFixture('course-with-cues');
    input[input.length - 1] ^= 1;
    await expect(encodeTrackCourse(input)).rejects.toMatchObject({
      code: 'DECODE_FAILED',
    });
  });
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

  it.each([
    '1980-01-01T00:00:00.000Z',
    '1998-07-03T21:24:15.999Z',
    '2126-02-06T06:28:15.000Z',
  ])(
    'rejects an activity timestamp outside the FIT range as file input: %s',
    async (timestamp) => {
      const input = Buffer.from(
        gpx.toString().replace('2026-07-20T00:00:00.000Z', timestamp),
      );
      const error = await transcodeTrackFile(input, 'fit').catch(
        (reason: unknown) => reason,
      );
      const mapped = mapTrackFileRequestError(error, { targetFormat: 'fit' });
      expect(mapped?.getStatus()).toBe(400);
      expect(mapped?.getResponse()).toMatchObject({
        code: 'TRACK_FILE_FIT_TIMESTAMPS_OUT_OF_RANGE',
        data: { origin: 'UPLOADED_FILE' },
      });
    },
  );

  it('rejects an out-of-range lap timestamp even when the activity points are valid', async () => {
    const input = Buffer.from(
      metricTcx(true)
        .toString()
        .replace(
          `<Lap StartTime="${sampleTimes[0]}">`,
          '<Lap StartTime="1989-01-01T00:00:00.000Z">',
        ),
    );
    await expect(transcodeTrackFile(input, 'fit')).rejects.toMatchObject({
      code: 'FIT_TIMESTAMPS_OUT_OF_RANGE',
    });
  });

  it.each([false, true])(
    'encodes every route point with incomplete source times (mixed: %s)',
    async (mixed) => {
      const input = Buffer.from(
        '<gpx version="1.1" creator="server-test"><rte>' +
          '<rtept lat="31.2" lon="121.4" />' +
          '<rtept lat="31.201" lon="121.4">' +
          (mixed ? '<time>2026-01-01T00:00:00Z</time>' : '') +
          '</rtept><rtept lat="31.202" lon="121.4" />' +
          '</rte></gpx>',
      );
      const decoded = readFitCourse(await encodeTrackCourse(input));
      expect(decoded).toMatchObject({
        integrity: true,
        errors: 0,
        type: 'course',
      });
      expect(decoded.records).toHaveLength(3);
      const firstTimestamp = Date.parse(decoded.records[0].timestamp);
      decoded.records.forEach((record, index) => {
        expect(record.positionLat * (180 / 2 ** 31)).toBeCloseTo(
          31.2 + index * 0.001,
          6,
        );
        expect(record.positionLong * (180 / 2 ** 31)).toBeCloseTo(121.4, 6);
        expect(Date.parse(record.timestamp) - firstTimestamp).toBe(
          index * 1000,
        );
        expect(record.speed).toBeUndefined();
      });
      expect(decoded.records[0].distance).toBe(0);
      expect(decoded.records[1].distance).toBeGreaterThan(100);
      expect(decoded.records[2].distance).toBeGreaterThan(
        decoded.records[1].distance!,
      );
    },
  );

  it.each([2026, 1980])(
    'preserves the intervals of a complete FIT Course timeline from %s',
    async (year) => {
      const input = Buffer.from(
        multiPointGpx.toString().replaceAll('2026-', `${year}-`),
      );
      const decoded = readFitCourse(await encodeTrackCourse(input));
      const start = Date.parse(decoded.records[0].timestamp);
      expect(
        decoded.records.map(({ timestamp }) => Date.parse(timestamp) - start),
      ).toEqual([0, 10_000, 20_000]);
      if (year === 2026) {
        expect(decoded.records.map(({ timestamp }) => timestamp)).toEqual(
          sampleTimes,
        );
      }
      expect(decoded.records[0].distance).toBe(0);
      expect(decoded.records[2].distance).toBeGreaterThan(
        decoded.records[1].distance!,
      );
    },
  );

  it('encodes course points at the antimeridian without inventing distance between duplicates', async () => {
    const input = Buffer.from(
      '<gpx version="1.1" creator="server-test"><rte>' +
        '<rtept lat="40" lon="179.99999995" />'.repeat(2) +
        '</rte></gpx>',
    );
    const decoded = readFitCourse(await encodeTrackCourse(input));
    expect(decoded.records).toHaveLength(2);
    for (const record of decoded.records) {
      expect(Math.abs(record.positionLong * (180 / 2 ** 31))).toBeCloseTo(
        180,
        6,
      );
      expect(record.distance).toBe(0);
    }
  });

  it('rejects a route whose cumulative distance would wrap in FIT', async () => {
    const input = Buffer.from(
      '<gpx version="1.1" creator="server-test"><rte>' +
        '<rtept lat="0" lon="0" /><rtept lat="0" lon="-180" />'.repeat(2) +
        '</rte></gpx>',
    );
    const error = await encodeTrackCourse(input).catch(
      (reason: unknown) => reason,
    );
    const mapped = mapTrackFileRequestError(error, { targetFormat: 'fit' });
    expect(mapped?.getStatus()).toBe(400);
    expect(mapped?.getResponse()).toMatchObject({
      code: 'TRACK_FILE_COURSE_DISTANCE_OUT_OF_RANGE',
    });
  });

  it('reports a missing course geometry as file input', async () => {
    const error = await encodeTrackCourse(fitFixture('indoor')).catch(
      (reason: unknown) => reason,
    );
    const mapped = mapTrackFileRequestError(error, { targetFormat: 'fit' });
    expect(mapped?.getStatus()).toBe(400);
    expect(mapped?.getResponse()).toMatchObject({
      code: 'TRACK_FILE_COURSE_COORDINATES_REQUIRED',
      data: { origin: 'UPLOADED_FILE' },
    });
  });

  it.each([
    { name: 'GPX', input: multiPointGpx, hasSpeed: true },
    { name: 'outdoor TCX', input: metricTcx(true), hasSpeed: true },
    { name: 'indoor TCX', input: metricTcx(false), hasSpeed: false },
  ])(
    'preserves distance and speed when converting $name to FIT',
    async ({ input, hasSpeed }) => {
      const source = await decodeTrackFile(input);
      const before = trackFileRecords(source.activity);
      expect(before).toHaveLength(3);
      expect(before.some((record) => (record.distance ?? 0) > 0)).toBe(true);
      if (hasSpeed)
        expect(before.some((record) => (record.speed ?? 0) > 0)).toBe(true);

      const { content, report } = await transcodeTrackFile(input, 'fit');
      expect(report).toMatchObject({
        inputRecords: 3,
        outputRecords: 3,
        warnings: [],
      });
      const output = await decodeTrackFile(content);
      const after = trackFileRecords(output.activity);
      expect(after).toHaveLength(before.length);
      before.forEach((record, index) => {
        for (const [key, tolerance] of [
          ['distance', 0.0051],
          ['speed', 0.00051],
        ] as const) {
          if (record[key] === undefined) continue;
          expect(typeof after[index][key]).toBe('number');
          expect(
            Math.abs(after[index][key]! - record[key]!),
          ).toBeLessThanOrEqual(tolerance);
        }
      });
      expect(output.activity.activities![0].totalDistance).toBeCloseTo(
        source.activity.activities![0].totalDistance!,
        2,
      );
      expect(output.activity.activities![0].laps[0].totalDistance).toBeCloseTo(
        source.activity.activities![0].laps[0].totalDistance!,
        2,
      );
    },
  );
});
