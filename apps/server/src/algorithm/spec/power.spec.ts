import { describe, expect, it } from '@jest/globals';
import {
  estimateCalculatedPower,
  estimateCyclingPower,
  estimateRunningPower,
  measuredPowerCoverage,
} from '../power';

describe('power algorithms', () => {
  it('keeps flat running estimates below metabolic-power range', () => {
    const [power] = estimateRunningPower([{ speed: 4, grade: 0 }], 70, 1.75);

    expect(power).toBeCloseTo(373.9403695997357, 6);
    expect(power).toBeLessThan(450);
  });

  it('applies canonical percent grade to running calculated power', () => {
    const [flat] = estimateRunningPower([{ speed: 4, grade: 0 }], 70);
    const [uphill] = estimateRunningPower([{ speed: 4, grade: 5 }], 70);
    const [downhill] = estimateRunningPower([{ speed: 4, grade: -5 }], 70);

    expect(uphill).toBeGreaterThan(flat);
    expect(downhill).toBeLessThan(flat);
  });

  it('applies canonical percent grade to cycling calculated power', () => {
    const [flat] = estimateCyclingPower([{ speed: 8, grade: 0 }], 70);
    const [uphill] = estimateCyclingPower([{ speed: 8, grade: 5 }], 70);
    const [downhill] = estimateCyclingPower([{ speed: 8, grade: -5 }], 70);

    expect(flat).toBeCloseTo(134.032, 2);
    expect(uphill).toBeGreaterThan(flat);
    expect(downhill).toBe(0);
  });

  it('uses an observed low cadence as coasting but does not invent cadence', () => {
    const [missingCadence] = estimateCyclingPower(
      [{ speed: 8, grade: 3 }],
      70,
    );
    const [coasting] = estimateCyclingPower(
      [{ speed: 8, grade: 3, cadence: 0 }],
      70,
    );
    const [pedaling] = estimateCyclingPower(
      [{ speed: 8, grade: 3, cadence: 80 }],
      70,
    );

    expect(missingCadence).toBeGreaterThan(0);
    expect(coasting).toBe(0);
    expect(pedaling).toBeCloseTo(missingCadence, 8);
  });

  it('does not turn an isolated imported speed spike into a power spike', () => {
    const powers = estimateCyclingPower(
      [5.602, 5.637, 17.24, 5.757, 5.824].map((speed, index) => ({
        timestamp: index * 1_000,
        speed,
      })),
      76.8,
    );

    expect(powers[2]).toBeLessThan(70);
    expect(Math.max(...powers)).toBeLessThan(70);
  });

  it('keeps calculated power separate and skips it when measured coverage is reliable', () => {
    const records = Array.from({ length: 10 }, (_, index) => ({
      speed: 4,
      power: index < 5 ? 300 : undefined,
    }));

    expect(measuredPowerCoverage(records)).toBe(0.5);
    expect(
      estimateCalculatedPower({
        records,
        sportType: 'RUN',
        weightKg: 70,
        measuredPowerCoverage: measuredPowerCoverage(records),
      }),
    ).toBeNull();
  });

  it('treats zero-watt coasting samples as measured power', () => {
    const records = Array.from({ length: 10 }, (_, index) => ({
      speed: 8,
      power: index < 6 ? 0 : undefined,
    }));

    expect(measuredPowerCoverage(records)).toBe(0.6);
    expect(
      estimateCalculatedPower({
        records,
        sportType: 'CYCLING',
        weightKg: 70,
        measuredPowerCoverage: measuredPowerCoverage(records),
      }),
    ).toBeNull();
  });

  it('generates a complete calculated series without mutating measured power', () => {
    const records = [{ speed: 4, grade: 1, power: undefined }];
    const calculated = estimateCalculatedPower({
      records,
      sportType: 'RUN',
      weightKg: 70,
    });

    expect(calculated).toHaveLength(1);
    expect(calculated?.[0]).toBeGreaterThan(0);
    expect(records[0].power).toBeUndefined();
  });
});
