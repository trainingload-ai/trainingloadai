import { describe, expect, it } from '@jest/globals';
import { describeCoachZoneBasis } from '../coach-zone-basis';

describe('authoritative coach zone basis', () => {
  it('reports VO2max as estimated-only', () => {
    expect(
      describeCoachZoneBasis(
        { benchmark: 'VO2MAX', zones: [] },
        { vo2max: 42 },
        [],
      ),
    ).toMatchObject({ benchmarkValue: 42, effectiveMode: 'ESTIMATED_ONLY' });
  });
  it('reports an AUTO FTP even when a larger manual value exists', () => {
    expect(
      describeCoachZoneBasis(
        {
          benchmark: 'FTP',
          configurationSource: 'generated',
          model: 'FRIEL',
          zones: [],
        },
        { ftp: 71 },
        [
          {
            metric: 'ftp',
            effectiveCurrent: 71,
            effectiveSource: 'AUTO',
            autoUpdateEnabled: true,
          },
        ],
      ),
    ).toMatchObject({
      model: 'FRIEL',
      benchmarkValue: 71,
      benchmarkSource: 'AUTO',
      autoUpdateEnabled: true,
    });
  });
  it('never guesses a named model from seven saved CP zones', () => {
    expect(
      describeCoachZoneBasis(
        {
          benchmark: 'CP',
          configurationSource: 'saved',
          zones: Array.from({ length: 7 }, (_, i) => ({ name: `z${i + 1}` })),
        },
        { cp: 240 },
        [{ metric: 'cp', effectiveSource: 'MANUAL', autoUpdateEnabled: false }],
      ),
    ).toMatchObject({
      model: null,
      benchmarkMetric: 'CP',
      benchmarkValue: 240,
      benchmarkSource: 'MANUAL',
      autoUpdateEnabled: false,
    });
  });
  it('labels a calculation-only LTHR fallback rather than inventing a measured threshold', () => {
    expect(
      describeCoachZoneBasis(
        { benchmark: 'LTHR', zones: [] },
        { maxHeartRate: 190 },
        [],
      ),
    ).toMatchObject({
      benchmarkValue: 167,
      benchmarkSource: 'ESTIMATED_MAX_HR',
      effectiveMode: 'DERIVED_FOR_CALCULATION',
      autoUpdateEnabled: null,
    });
  });
  it('reports HR reserve and resting offset separately', () => {
    expect(
      describeCoachZoneBasis(
        { benchmark: 'HRR', zones: [] },
        { maxHeartRate: 190, restingHeartRate: 50 },
        [],
      ),
    ).toMatchObject({
      benchmarkValue: 140,
      restingHeartRateOffset: 50,
      benchmarkSource: 'DERIVED_HR_RESERVE',
    });
  });
  it('does not invent an FTP baseline for absolute custom zones', () => {
    expect(
      describeCoachZoneBasis(
        { benchmark: 'CUSTOM', zones: [] },
        { ftp: 250 },
        [],
      ),
    ).toMatchObject({
      benchmarkValue: null,
      benchmarkSource: 'CUSTOM_ABSOLUTE',
      autoUpdateEnabled: null,
    });
  });
});
