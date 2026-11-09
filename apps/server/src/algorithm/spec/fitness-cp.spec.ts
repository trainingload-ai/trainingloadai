import { describe, expect, it } from '@jest/globals';
import {
  calculateCp,
  measuredPowerPeaks,
  suppressIsolatedPowerSpikes,
} from '../fitness-cp';

const point = (seconds: number, value: number) => ({ seconds, value });

function requireFit(result: ReturnType<typeof calculateCp>) {
  expect(result.valid).toBe(true);
  if (!result.valid) throw new Error(result.reason);
  return result;
}

/** Monotone amateur curve: CP near the long means, P_MAX near the sprint. */
const healthy = [
  point(1, 1100),
  point(5, 900),
  point(15, 700),
  point(30, 580),
  point(60, 480),
  point(120, 400),
  point(180, 360),
  point(300, 330),
  point(600, 300),
  point(1200, 280),
  point(1800, 270),
  point(3600, 255),
];

const mild = [
  point(30, 280),
  point(45, 260),
  point(60, 250),
  point(120, 230),
  point(180, 220),
  point(600, 200),
  point(900, 195),
  point(1200, 190),
  point(3600, 180),
];

describe('extended CP plausibility', () => {
  it('fits a moderate CP on a healthy monotone curve', () => {
    const result = requireFit(calculateCp(healthy));

    expect(result.converged).toBe(true);
    expect(result.cp).toBeGreaterThan(230);
    expect(result.cp).toBeLessThan(320);
    expect(result.ftp).toBe(Math.round(result.cp * 0.95));
    expect(result.pMax).toBeGreaterThan(result.cp);
    expect(result.pMax).toBeLessThan(1600);
    expect(result.wPrime).toBeGreaterThan(5_000);
    expect(result.wPrime).toBeLessThan(40_000);
  });

  it('keeps a sustained sprint instead of treating it as a spike', () => {
    const result = requireFit(
      calculateCp([
        point(1, 1600),
        point(5, 1400),
        point(15, 1000),
        point(30, 780),
        point(60, 560),
        point(180, 400),
        point(600, 310),
        point(1200, 285),
        point(3600, 260),
      ]),
    );

    expect(result.cp).toBeGreaterThan(240);
    expect(result.cp).toBeLessThan(340);
    expect(result.pMax).toBeGreaterThan(1200);
    expect(result.pMax).toBeLessThan(2200);
  });

  it('keeps the in-range curve already published from ordinary peaks', () => {
    expect(
      calculateCp([
        point(30, 800),
        point(60, 650),
        point(180, 500),
        point(600, 430),
        point(1200, 330),
        point(3600, 280),
      ]),
    ).toMatchObject({
      valid: true,
      cp: 401,
      ftp: 381,
      pMax: 800,
      wPrime: 84655,
    });
  });

  it('ignores a single multi-kW one-second spike on mild longer means', () => {
    const baseline = requireFit(calculateCp(mild));
    const spiked = requireFit(calculateCp([point(1, 5000), ...mild]));

    expect(spiked).toMatchObject({
      cp: baseline.cp,
      ftp: baseline.ftp,
      pMax: baseline.pMax,
      wPrime: baseline.wPrime,
    });
    expect(spiked.pMax).toBeLessThan(1000);
  });

  it('ignores a one-second spike that is still inside the longer-window work budget', () => {
    const curve = [
      point(30, 800),
      point(60, 650),
      point(180, 500),
      point(600, 430),
      point(1200, 330),
      point(3600, 280),
    ];
    const baseline = requireFit(calculateCp(curve));
    const spiked = requireFit(calculateCp([point(1, 5000), ...curve]));

    expect(spiked).toMatchObject({
      cp: baseline.cp,
      pMax: baseline.pMax,
      wPrime: baseline.wPrime,
    });
    expect(spiked.cp).toBeLessThan(500);
    expect(spiked.pMax).toBeLessThan(1500);
  });

  it('rejects a pathological set that previously fitted a huge P_MAX', () => {
    // Unsmoothed, this set converged to CP ≈ 2662 and P_MAX ≈ 117316.
    const result = calculateCp([
      point(1, 160862),
      point(5, 80000),
      point(30, 20000),
      point(60, 15000),
      point(180, 400),
      point(600, 4236),
      point(1200, 280),
    ]);

    expect(result).toEqual({ valid: false, reason: 'MISSING_SIGNAL' });
  });

  it('does not validate a fit whose critical power is thousands of watts', () => {
    const result = calculateCp([
      point(30, 5000),
      point(60, 4800),
      point(180, 4600),
      point(600, 4400),
      point(1200, 4300),
    ]);

    expect(result.valid).toBe(false);
    if (result.valid || result.reason !== 'QUALITY_REJECTED') {
      throw new Error(`expected quality rejection, got ${result.reason}`);
    }
    expect(result.cp).toBeGreaterThan(1000);
    expect(result.pMax).toBeGreaterThan(1000);
  });

  it('does not validate the spiked production shape as a 4000 W model', () => {
    const result = calculateCp([
      point(1, 160862),
      point(30, 480),
      point(60, 420),
      point(180, 360),
      point(600, 4236),
      point(1200, 300),
      point(3600, 260),
    ]);

    const fit = requireFit(result);
    expect(fit.cp).toBeLessThan(500);
    expect(fit.pMax).toBeLessThan(1500);
    expect(fit.wPrime).toBeLessThan(100_000);
  });
});

describe('measured power spike filter', () => {
  it('nulls an isolated multi-kW sample and keeps a sustained sprint', () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      seconds: index,
      power: index === 2 ? 4500 : index >= 6 && index <= 8 ? 2300 : 200,
    }));

    expect(
      suppressIsolatedPowerSpikes(samples).map((sample) => sample.power),
    ).toEqual([200, 200, null, 200, 200, 200, 2300, 2300, 2300, 200, 200, 200]);
  });

  it('does not let one sub-ceiling spike raise the 30s mean', () => {
    const steady = measuredPowerPeaks(
      Array.from({ length: 1201 }, (_, index) => ({
        seconds: index,
        power: 200,
      })),
    );
    const spiked = measuredPowerPeaks(
      Array.from({ length: 1201 }, (_, index) => ({
        seconds: index,
        power: index === 10 ? 2400 : 200,
      })),
    );

    expect(steady.find((peak) => peak.seconds === 30)?.value).toBe(200);
    expect(spiked.find((peak) => peak.seconds === 30)?.value).toBe(200);
    expect(spiked.find((peak) => peak.seconds === 1200)?.value).toBe(200);
    expect(spiked).toEqual(steady);
  });

  it('keeps a flat multi-second sprint above 2 kW', () => {
    const powers = suppressIsolatedPowerSpikes(
      Array.from({ length: 80 }, (_, second) => ({
        seconds: second,
        power: second >= 20 && second < 28 ? 2400 : 250,
      })),
    ).map((sample) => sample.power);

    expect(Math.max(...powers.filter((power) => power != null))).toBe(2400);
  });

  it('drops a startup discharge that peaks near 2931 W and then falls smoothly', () => {
    const decay = [
      1113, 1680, 2133, 2487, 2750, 2931, 2808, 2742, 2669, 2595, 2512, 2419,
      2333, 2229, 2131, 2032, 1934, 1835, 1742, 1649, 1557, 1467, 1382, 1302,
      1223, 1146, 1073, 1004, 939, 877, 819, 764, 712, 667, 621, 579, 540, 502,
      466, 433,
    ];
    const samples = [
      ...Array.from({ length: 6 }, (_, second) => ({
        seconds: second,
        power: 0,
      })),
      ...decay.map((power, index) => ({ seconds: 6 + index, power })),
      ...Array.from({ length: 1300 }, (_, index) => ({
        seconds: 50 + index,
        power: 320,
      })),
    ];
    const filtered = suppressIsolatedPowerSpikes(samples);
    const remaining = filtered
      .map((sample) => sample.power)
      .filter((power) => power != null);

    expect(Math.max(...remaining)).toBeLessThan(500);
    const fit = requireFit(
      calculateCp(
        measuredPowerPeaks(filtered).map((peak) => ({
          seconds: peak.seconds,
          value: peak.value,
        })),
      ),
    );
    expect(fit.cp).toBeGreaterThan(200);
    expect(fit.cp).toBeLessThan(400);
    expect(fit.pMax).toBeLessThan(600);
  });

  it('drops a startup discharge that peaks near 3877 W across a short recording gap', () => {
    const samples = [
      { seconds: 5, power: 1660 },
      { seconds: 7, power: 2510 },
      { seconds: 8, power: 3186 },
      { seconds: 9, power: 3710 },
      { seconds: 16, power: 3877 },
      { seconds: 17, power: 3698 },
      { seconds: 18, power: 3524 },
      { seconds: 19, power: 3349 },
      { seconds: 20, power: 3166 },
      { seconds: 21, power: 2990 },
      { seconds: 22, power: 2822 },
      { seconds: 23, power: 2649 },
      ...Array.from({ length: 1300 }, (_, index) => ({
        seconds: 90 + index,
        power: 280,
      })),
    ];
    const filtered = suppressIsolatedPowerSpikes(samples);
    const remaining = filtered
      .map((sample) => sample.power)
      .filter((power) => power != null);

    expect(Math.max(...remaining)).toBe(280);
    expect(remaining.some((power) => power >= 2000)).toBe(false);
  });

  it('refuses the mean-maximal curve left behind by those startup discharges', () => {
    const spiked = calculateCp([
      point(1, 2931),
      point(5, 2780),
      point(30, 1890),
      point(60, 1123),
      point(180, 543),
      point(600, 321),
      point(1200, 287),
    ]);
    const higher = calculateCp([
      point(1, 3877),
      point(5, 3523),
      point(30, 893),
      point(60, 808),
      point(180, 468),
      point(600, 274),
      point(1200, 211),
    ]);

    expect(spiked.valid).toBe(false);
    expect(higher.valid).toBe(false);
    expect(
      spiked.reason === 'MISSING_SIGNAL' || (spiked.pMax ?? 0) < 1000,
    ).toBe(true);
    expect(
      higher.reason === 'MISSING_SIGNAL' || (higher.pMax ?? 0) < 1500,
    ).toBe(true);
  });
});
