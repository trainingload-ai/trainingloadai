import { describe, it, expect, jest } from '@jest/globals';
import { calculateFieldLthr } from '@/algorithm/fitness-lthr';
import * as cpKernel from '@/algorithm/cp-estimate';
import { calculateCp, measuredPowerPeaks } from '@/algorithm/fitness-cp';
import {
  dateBoundary,
  fingerprint,
  validateEvidenceRequest,
} from '../fitness-input';
import { isFitnessResult } from '@shared/fitness-assessment';
const hr = (step = 1) =>
  Array.from({ length: 1800 / step + 1 }, (_, i) => ({
    seconds: i * step,
    heartRate: i * step < 600 ? 160 : 176,
  }));
describe('fitness scientific input contracts', () => {
  it('computes the last 20 minutes on the original clock', () => {
    const r = calculateFieldLthr(hr(), 0);
    expect(r.valid).toBe(true);
    expect(r.value).toBe(176);
  });
  it('integrates uneven samples by time, not sample count', () => {
    const samples = hr()
      .filter((p) => p.seconds < 900 || p.seconds % 5 === 0)
      .map((p) => ({ ...p, heartRate: 160 + p.seconds / 100 }));
    const r = calculateFieldLthr(samples, 0, 5);
    expect(r.valid).toBe(true);
    expect(r.rawMean).toBeCloseTo(172, 5);
  });
  it('does not inflate coverage by interpolating a gap', () => {
    const r = calculateFieldLthr(
      hr().filter((p) => p.seconds < 950 || p.seconds > 990),
      0,
    );
    expect(r.valid).toBe(false);
    expect(
      r.checks.find((c) => c.code === 'MAX_GAP_SECONDS')!.observed,
    ).toBeGreaterThan(30);
  });
  it('rejects accumulated missingness, duplicate times and stitched short activities', () => {
    expect(
      calculateFieldLthr(
        hr().filter((p) => p.seconds % 10 !== 0),
        0,
      ).valid,
    ).toBe(false);
    expect(calculateFieldLthr([hr()[0], ...hr()], 0).valid).toBe(false);
    expect(
      calculateFieldLthr([...hr().slice(0, 900), ...hr().slice(0, 900)], 0)
        .valid,
    ).toBe(false);
  });
  it('retains zero power and distinguishes real observed durations', () => {
    const peaks = measuredPowerPeaks(
      Array.from({ length: 1201 }, (_, i) => ({ seconds: i, power: 200 })),
    );
    expect(peaks.find((p) => p.seconds === 1200)?.value).toBe(200);
    expect(peaks).toHaveLength(8);
    expect(
      measuredPowerPeaks(
        Array.from({ length: 31 }, (_, i) => ({
          seconds: i,
          power: i < 15 ? 0 : 200,
        })),
      )[0].value,
    ).toBeLessThan(120);
  });
  it('does not fit fake coverage or return a number for nonfinite evidence', () => {
    expect(
      calculateCp([
        { seconds: 30, value: 300 },
        { seconds: 60, value: 250 },
      ]).valid,
    ).toBe(false);
    expect(calculateCp([{ seconds: 30, value: Infinity }]).valid).toBe(false);
  });
  it('rejects a non-converged kernel even when it returns finite values', () => {
    const original = cpKernel.estimateExtendedCP;
    const spy = jest
      .spyOn(cpKernel, 'estimateExtendedCP')
      .mockImplementation((data, options) => {
        const model = original(data);
        options?.onDiagnostics?.({ converged: false, iterations: 102 });
        return model;
      });
    try {
      expect(
        calculateCp(
          [30, 45, 60, 120, 180, 600, 900, 1200].map((seconds) => ({
            seconds,
            value: 250 + 18000 / seconds,
          })),
        ),
      ).toMatchObject({ valid: false, reason: 'NON_CONVERGENCE' });
    } finally {
      spy.mockRestore();
    }
  });
  it('preserves the fixed seconds-index CP vector and rejects repeated durations as independent evidence', () => {
    const vector = [30, 45, 60, 120, 180, 600, 900, 1200, 3600, 7200].map(
      (seconds) => ({ seconds, value: 250 + 18000 / seconds }),
    );
    expect(calculateCp(vector)).toMatchObject({
      valid: true,
      converged: true,
      cp: 254,
      ftp: 241,
      wPrime: 172248,
      iterations: 23,
    });
    expect(
      calculateCp(
        [30, 30, 60, 600, 600].map((seconds) => ({ seconds, value: 300 })),
      ),
    ).toMatchObject({ valid: false, reason: 'MISSING_SIGNAL' });
  });
  it('resolves local midnight across DST and UTC day changes', () => {
    const sh = dateBoundary('2026-09-25', 'Asia/Shanghai');
    expect(sh.from.toISOString()).toBe('2026-09-24T16:00:00.000Z');
    const dst = dateBoundary('2026-03-08', 'America/New_York');
    expect(dst.to.getTime() - dst.from.getTime()).toBe(23 * 3600000);
    expect(() => dateBoundary('2026-02-30', 'Asia/Shanghai')).toThrow();
  });
  it('hashes actual values with stable object ordering', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    expect(fingerprint({ a: 2 })).not.toBe(fingerprint({ a: 1 }));
  });
  it('validates ranges and untrusted client results', () => {
    expect(() =>
      validateEvidenceRequest({
        methodId: 'x',
        metric: 'LTHR',
        sport: 'RUN',
        scope: { kind: 'RECENT', asOf: '2026-09-25' },
      }),
    ).toThrow('explicit timezone');
    expect(() =>
      validateEvidenceRequest({
        methodId: 'x',
        metric: 'LTHR',
        sport: 'RUN',
        scope: { kind: 'RECENT', days: 181 },
      }),
    ).toThrow();
    expect(
      isFitnessResult({ kind: 'fitness_assessment_result', schemaVersion: 1 }),
    ).toBe(false);
  });
});
