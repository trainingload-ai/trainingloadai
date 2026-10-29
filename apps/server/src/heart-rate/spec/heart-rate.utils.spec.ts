import { describe, expect, it } from '@jest/globals';
import { $Enums, SportType } from '@prisma/client';
import { generateHeartRateZonesFromProfile } from '../heart-rate.utils';

describe('generateHeartRateZonesFromProfile', () => {
  it('preserves explicitly selected Karvonen zones', () => {
    expect(
      generateHeartRateZonesFromProfile(
        {
          maxHeartRate: 190,
          restingHeartRate: 50,
          heartRateZoneModel: $Enums.HeartRateZoneModel.KARVONEN,
        },
        SportType.RUN,
      ),
    ).toEqual({
      benchmark: $Enums.ZoneBase.HRR,
      benchmarkSource: 'PROFILE',
      zones: [
        { min: 120, max: 134, name: 'Z1' },
        { min: 135, max: 148, name: 'Z2' },
        { min: 149, max: 162, name: 'Z3' },
        { min: 163, max: 176, name: 'Z4' },
        { min: 177, max: 250, name: 'Z5' },
      ],
    });
  });

  it.each([undefined, $Enums.HeartRateZoneModel.MHR])(
    'uses maximum heart rate for default/explicit %s even with other metrics available',
    (heartRateZoneModel) => {
      const result = generateHeartRateZonesFromProfile(
        {
          heartRateZoneModel,
          maxHeartRate: 200,
          restingHeartRate: 60,
          lthr: 180,
        },
        SportType.RUN,
      );
      expect(result).toEqual({
        benchmark: $Enums.ZoneBase.MHR,
        benchmarkSource: 'PROFILE',
        zones: [
          { name: 'Z1', min: 100, max: 120 },
          { name: 'Z2', min: 121, max: 140 },
          { name: 'Z3', min: 141, max: 160 },
          { name: 'Z4', min: 161, max: 180 },
          { name: 'Z5', min: 181, max: 250 },
        ],
      });
    },
  );

  it.each([undefined, 0, -1, NaN, Infinity])(
    'does not replace missing/invalid MHR %s with another basis',
    (maxHeartRate) => {
      expect(
        generateHeartRateZonesFromProfile(
          {
            heartRateZoneModel: $Enums.HeartRateZoneModel.MHR,
            maxHeartRate,
            restingHeartRate: 60,
            lthr: 180,
          },
          SportType.RUN,
        ),
      ).toBeNull();
    },
  );

  it('uses Friel running zones when LTHR is available', () => {
    const result = generateHeartRateZonesFromProfile(
      {
        lthr: 170,
        heartRateZoneModel: $Enums.HeartRateZoneModel.FRIEL,
      },
      SportType.RUN,
    );

    expect(result).toEqual({
      benchmark: $Enums.ZoneBase.LTHR,
      benchmarkSource: 'PROFILE',
      zones: [
        { min: 0, max: 145, name: 'Z1 Recovery' },
        { min: 145, max: 151, name: 'Z2 Aerobic' },
        { min: 153, max: 160, name: 'Z3 Tempo' },
        { min: 162, max: 168, name: 'Z4 SubThreshold' },
        { min: 170, max: 173, name: 'Z5a SuperThreshold' },
        { min: 175, max: 180, name: 'Z5b AerobicCapacity' },
        { min: 182, max: 250, name: 'Z5c AnaerobicCapacity' },
      ],
    });
  });

  it('uses Friel cycling zones for non-run sports', () => {
    const result = generateHeartRateZonesFromProfile(
      {
        lthr: 160,
        heartRateZoneModel: $Enums.HeartRateZoneModel.FRIEL,
      },
      SportType.CYCLING,
    );

    expect(result).toEqual({
      benchmark: $Enums.ZoneBase.LTHR,
      benchmarkSource: 'PROFILE',
      zones: [
        { min: 0, max: 130, name: 'Z1' },
        { min: 131, max: 142, name: 'Z2' },
        { min: 144, max: 149, name: 'Z3' },
        { min: 150, max: 158, name: 'Z4' },
        { min: 160, max: 163, name: 'Z5a' },
        { min: 165, max: 170, name: 'Z5b' },
        { min: 171, max: 250, name: 'Z5c' },
      ],
    });
  });

  it('falls back to max heart rate zones when the preferred model lacks inputs', () => {
    expect(
      generateHeartRateZonesFromProfile(
        {
          maxHeartRate: 200,
          heartRateZoneModel: $Enums.HeartRateZoneModel.KARVONEN,
        },
        SportType.RUN,
      ),
    ).toEqual({
      benchmark: $Enums.ZoneBase.MHR,
      benchmarkSource: 'PROFILE',
      zones: [
        { min: 100, max: 120, name: 'Z1' },
        { min: 121, max: 140, name: 'Z2' },
        { min: 141, max: 160, name: 'Z3' },
        { min: 161, max: 180, name: 'Z4' },
        { min: 181, max: 250, name: 'Z5' },
      ],
    });
  });

  it('uses an estimated LTHR for Friel zones when only MAXHR is available', () => {
    const result = generateHeartRateZonesFromProfile(
      {
        maxHeartRate: 190,
        heartRateZoneModel: $Enums.HeartRateZoneModel.FRIEL,
      },
      SportType.RUN,
    );

    expect(result).toMatchObject({
      benchmark: $Enums.ZoneBase.LTHR,
      benchmarkSource: 'ESTIMATED_MAX_HR',
    });
    expect(result?.zones.slice(0, 2)).toEqual([
      { min: 0, max: 142, name: 'Z1 Recovery' },
      { min: 142, max: 149, name: 'Z2 Aerobic' },
    ]);
  });

  it('returns null when no selected or fallback model can be generated', () => {
    expect(
      generateHeartRateZonesFromProfile(
        {
          heartRateZoneModel: $Enums.HeartRateZoneModel.FRIEL,
        },
        SportType.RUN,
      ),
    ).toBeNull();
  });
});
