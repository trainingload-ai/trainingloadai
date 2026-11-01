import { describe, expect, it } from '@jest/globals';
import type { ActivityRecordType, FileType } from 'trackswap';
import {
  assessTrackFileConversion,
  assertTrackFileConvertible,
} from '../track-file-conversion';

const record: ActivityRecordType = {
  index: 0,
  lapIndex: 0,
  timestamp: new Date('2026-07-20T00:00:00Z'),
  positionLat: 0,
  positionLong: 0,
  heartRate: 0,
};
const file = (records: ActivityRecordType[]): FileType => ({
  activities: [{ index: 0, laps: [{ index: 0, records, lengths: [] }] }],
});
function assess(source: FileType, output: FileType) {
  return assessTrackFileConversion({
    source,
    output,
    sourceFormat: 'fit',
    targetFormat: 'gpx',
    sourceWarningCount: 0,
    hasNonActivityData: false,
  });
}

describe('conversion result validation', () => {
  it('accepts coordinates and measurement values of zero', () => {
    expect(() =>
      assertTrackFileConvertible(file([record]), 'gpx'),
    ).not.toThrow();
    expect(assess(file([record]), file([record])).warnings).toEqual([]);
  });

  it('rejects empty output and unexplained truncation', () => {
    expect(() => assess(file([record]), file([]))).toThrow('OUTPUT_INVALID');
    expect(() => assess(file([record, record]), file([record]))).toThrow(
      'OUTPUT_INVALID',
    );
  });

  it('rejects coordinate corruption and invented coordinates', () => {
    expect(() =>
      assess(file([record]), file([{ ...record, positionLat: 32 }])),
    ).toThrow('OUTPUT_INVALID');
    expect(() =>
      assessTrackFileConversion({
        source: file([
          { ...record, positionLat: undefined, positionLong: undefined },
        ]),
        output: file([record]),
        sourceFormat: 'fit',
        targetFormat: 'tcx',
        sourceWarningCount: 0,
        hasNonActivityData: false,
      }),
    ).toThrow('OUTPUT_INVALID');
  });

  it('rejects changed timestamps and missing activities', () => {
    expect(() =>
      assess(
        file([record]),
        file([{ ...record, timestamp: new Date('2026-07-21T00:00:00Z') }]),
      ),
    ).toThrow('OUTPUT_INVALID');
    expect(() =>
      assess(
        { activities: [...file([record]).activities!, { index: 1, laps: [] }] },
        file([record]),
      ),
    ).toThrow('OUTPUT_INVALID');
  });

  it('reports lost metrics even when the original value was zero', () => {
    expect(
      assess(file([record]), file([{ ...record, heartRate: undefined }]))
        .warnings,
    ).toContainEqual({ code: 'METRICS_NOT_PRESERVED', metrics: ['heartRate'] });
  });

  it('reports source parsing warnings and non-activity data loss', () => {
    const result = assessTrackFileConversion({
      source: file([record]),
      output: file([record]),
      sourceFormat: 'fit',
      targetFormat: 'gpx',
      sourceWarningCount: 2,
      outputWarningCount: 1,
      hasNonActivityData: true,
    });
    expect(result.warnings).toEqual([
      { code: 'SOURCE_WARNINGS', count: 2 },
      { code: 'OUTPUT_WARNINGS', count: 1 },
      { code: 'NON_ACTIVITY_DATA_OMITTED' },
    ]);
  });

  it('rejects incomplete timestamps before a FIT or TCX encoder can invent them', () => {
    const source = file([record, { ...record, timestamp: undefined }]);
    expect(() => assertTrackFileConvertible(source, 'fit')).toThrow(
      'TIMESTAMPS_REQUIRED',
    );
    expect(() => assertTrackFileConvertible(source, 'tcx')).toThrow(
      'TIMESTAMPS_REQUIRED',
    );
  });
});
