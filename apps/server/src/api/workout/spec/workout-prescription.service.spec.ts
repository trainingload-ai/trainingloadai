import { describe, expect, it } from '@jest/globals';
import {
  WorkoutPrescriptionError,
  WorkoutPrescriptionService,
} from '../workout-prescription.service';

const intent = {
  family: 'ENDURANCE' as const,
  purpose: 'Aerobic endurance',
  source: 'AI_COACH' as const,
};

describe('WorkoutPrescriptionService', () => {
  const service = new WorkoutPrescriptionService();

  const dynamicZoneCases: Array<
    [
      'RUN' | 'CYCLING' | 'SWIM',
      'PACE' | 'HEART_RATE' | 'POWER',
      number,
      number,
      'SPEED' | 'HEART_RATE_ZONE' | 'POWER_ZONE',
      'seconds' | 'bpm' | 'W',
      number,
    ]
  > = [
    ['RUN', 'PACE', 0.3, 0.35, 'SPEED', 'seconds', 300],
    ['RUN', 'HEART_RATE', 120, 140, 'HEART_RATE_ZONE', 'bpm', 120],
    ['RUN', 'POWER', 180, 220, 'POWER_ZONE', 'W', 180],
    ['CYCLING', 'PACE', 0.06, 0.07, 'SPEED', 'seconds', 60],
    ['CYCLING', 'HEART_RATE', 120, 140, 'HEART_RATE_ZONE', 'bpm', 120],
    ['CYCLING', 'POWER', 180, 220, 'POWER_ZONE', 'W', 180],
    ['SWIM', 'PACE', 1.05, 1.15, 'SPEED', 'seconds', 105],
    ['SWIM', 'HEART_RATE', 120, 140, 'HEART_RATE_ZONE', 'bpm', 120],
    ['SWIM', 'POWER', 180, 220, 'POWER_ZONE', 'W', 180],
  ];

  it.each(dynamicZoneCases)(
    'supports %s %s dynamic-zone prescriptions',
    (sportType, dimension, min, max, kind, unit, projectedLow) => {
      expect(
        service.resolve({
          sportType,
          dimension,
          intent,
          zoneIndex: 1,
          zoneSetting: {
            benchmark: 'CUSTOM',
            zones: [{ order: 1, name: 'Z1', min, max }],
          },
        }),
      ).toMatchObject({
        mode: 'DYNAMIC_ZONE',
        target: {
          kind,
          unit,
          value: projectedLow,
          zoneIndex: 1,
        },
      });
    },
  );

  it('resolves a running pace zone as a dynamic sec/km projection', () => {
    const result = service.resolve({
      sportType: 'RUN',
      dimension: 'PACE',
      intent,
      zoneIndex: 2,
      zoneSetting: {
        benchmark: 'THRESHOLD_PACE',
        zones: [
          { order: 1, name: 'Z1', min: 0.36, max: 0.42 },
          { order: 2, name: 'Z2', min: 0.3, max: 0.35 },
        ],
      },
      auxiliaryRpe: { low: 3, high: 4 },
    });

    expect(result).toMatchObject({
      mode: 'DYNAMIC_ZONE',
      auxiliaryRpe: { low: 3, high: 4 },
      target: {
        kind: 'SPEED',
        value: 300,
        valueHigh: 350,
        unit: 'seconds',
        zoneIndex: 2,
        zoneLabel: 'Z2',
        resolutionMode: 'DYNAMIC_ZONE',
        intensityIntent: {
          ...intent,
          auxiliaryRpe: { low: 3, high: 4 },
        },
      },
    });
    expect(result.zoneSystemKey).toMatch(/^[a-f0-9]{64}$/);
    expect(result.zoneFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves cycling power and swim pace with sport-specific projections', () => {
    const cycling = service.resolve({
      sportType: 'CYCLING',
      dimension: 'POWER',
      intent,
      zoneIndex: 3,
      zoneSetting: {
        benchmark: 'FTP',
        zones: [{ order: 3, name: 'Tempo', min: 180, max: 220 }],
      },
    });
    const swim = service.resolve({
      sportType: 'SWIM',
      dimension: 'PACE',
      intent,
      zoneIndex: 1,
      zoneSetting: {
        benchmark: 'CSS',
        zones: [{ order: 1, name: 'Easy', min: 1.05, max: 1.15 }],
      },
    });

    expect(cycling.target).toMatchObject({
      kind: 'POWER_ZONE',
      value: 180,
      valueHigh: 220,
      unit: 'W',
    });
    expect(swim.target).toMatchObject({
      kind: 'SPEED',
      value: 105,
      valueHigh: 115,
      unit: 'seconds',
    });
  });

  it('uses an evidence-backed fixed value only when explicitly allowed', () => {
    expect(() =>
      service.resolve({
        sportType: 'RUN',
        dimension: 'PACE',
        intent,
        fixedTarget: {
          low: 300,
          high: 315,
          unit: 'SECONDS',
          source: '5K race pace',
        },
      }),
    ).toThrow(WorkoutPrescriptionError);

    expect(
      service.resolve({
        sportType: 'RUN',
        dimension: 'PACE',
        intent,
        allowFixedTarget: true,
        fixedTarget: {
          low: 300,
          high: 315,
          unit: 'SECONDS',
          source: '5K race pace',
        },
      }),
    ).toMatchObject({
      mode: 'FIXED_VALUE',
      target: {
        kind: 'SPEED',
        value: 300,
        valueHigh: 315,
        resolutionMode: 'FIXED_VALUE',
      },
    });
  });

  it('falls back to effort without inventing a numeric target', () => {
    expect(
      service.resolve({
        sportType: 'SWIM',
        dimension: 'HEART_RATE',
        intent,
        auxiliaryRpe: { low: 3 },
      }),
    ).toEqual({
      mode: 'EFFORT_ONLY',
      target: {
        kind: 'NONE',
        intensityIntent: { ...intent, auxiliaryRpe: { low: 3 } },
        resolutionMode: 'EFFORT_ONLY',
      },
      zoneSystemKey: null,
      zoneFingerprint: null,
      auxiliaryRpe: { low: 3 },
      explanation: {
        source: 'EFFORT',
        dimension: 'HEART_RATE',
        summary:
          'No reliable executable zone or fixed anchor is available; use effort cues only',
      },
    });
  });

  it('rejects an out-of-range custom zone selection', () => {
    expect(() =>
      service.resolve({
        sportType: 'CYCLING',
        dimension: 'HEART_RATE',
        intent,
        zoneIndex: 4,
        zoneSetting: {
          benchmark: 'LTHR',
          zones: [{ order: 1, name: 'Z1', min: 110, max: 130 }],
        },
      }),
    ).toThrow(/does not exist/);
  });

  it('keeps the system identity stable for numeric changes only', () => {
    const first = service.zoneIdentity({
      sportType: 'RUN',
      dimension: 'HEART_RATE',
      setting: {
        benchmark: 'LTHR',
        zones: [
          { order: 1, name: 'Z1', min: 100, max: 120 },
          { order: 2, name: 'Z2', min: 121, max: 140 },
        ],
      },
    });
    const numericUpdate = service.zoneIdentity({
      sportType: 'RUN',
      dimension: 'HEART_RATE',
      setting: {
        benchmark: 'LTHR',
        zones: [
          { order: 1, name: 'Z1', min: 102, max: 123 },
          { order: 2, name: 'Z2', min: 124, max: 143 },
        ],
      },
    });
    const systemSwitch = service.zoneIdentity({
      sportType: 'RUN',
      dimension: 'HEART_RATE',
      setting: {
        benchmark: 'HRR',
        zones: [
          { order: 1, name: 'Z1', min: 102, max: 123 },
          { order: 2, name: 'Z2', min: 124, max: 143 },
        ],
      },
    });

    expect(numericUpdate.systemKey).toBe(first.systemKey);
    expect(numericUpdate.fingerprint).not.toBe(first.fingerprint);
    expect(systemSwitch.systemKey).not.toBe(first.systemKey);
  });
});
