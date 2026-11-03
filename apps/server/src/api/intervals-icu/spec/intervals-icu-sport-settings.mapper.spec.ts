import { describe, expect, it } from '@jest/globals';
import { mapIntervalsIcuAthleteToSportSettingsMetrics } from '../intervals-icu-sport-settings.mapper';

describe('mapIntervalsIcuAthleteToSportSettingsMetrics', () => {
  it('maps icu_resting_hr and per-sport sportSettings', () => {
    const writes = mapIntervalsIcuAthleteToSportSettingsMetrics({
      icu_resting_hr: 48,
      sportSettings: [
        {
          types: ['Ride'],
          ftp: 260,
          indoor_ftp: 250,
          max_hr: 190,
          lthr: 170,
        },
        {
          types: ['Run'],
          threshold_pace: 3.8,
        },
      ],
    });

    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'RESTING_HR',
          value: 48,
          sport: 'UNKNOWN',
        }),
        expect.objectContaining({ type: 'FTP', value: 260, sport: 'CYCLING' }),
        expect.objectContaining({ type: 'FTP', value: 250, sport: 'CYCLING' }),
        expect.objectContaining({
          type: 'MAX_HR',
          value: 190,
          sport: 'CYCLING',
        }),
        expect.objectContaining({ type: 'LTHR', value: 170, sport: 'CYCLING' }),
        expect.objectContaining({ type: 'CS', value: 3.8, sport: 'RUN' }),
      ]),
    );
  });

  it('ignores provider placeholders and values outside intrinsic metric bounds', () => {
    const writes = mapIntervalsIcuAthleteToSportSettingsMetrics({
      icu_resting_hr: 0,
      sportSettings: [
        {
          types: ['Ride'],
          ftp: 0,
          indoor_ftp: 29,
          max_hr: 0,
          lthr: 0,
          threshold_pace: 0,
          p_max: 49,
          w_prime: 499,
        },
        {
          types: ['Run'],
          threshold_pace: 0.2,
        },
      ],
    });

    expect(writes).toEqual([]);
  });
});
