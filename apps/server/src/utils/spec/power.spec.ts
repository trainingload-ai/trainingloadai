import { describe, expect, it } from '@jest/globals';
import { interpolateMmpData } from '../power';

describe('interpolateMmpData', () => {
  it('uses the duration in seconds as the array index', () => {
    const curve = interpolateMmpData([
      { duration: 30, power: 850 },
      { duration: 60, power: 550 },
    ]);

    expect(curve).toHaveLength(61);
    expect(curve[0]).toBe(0);
    expect(curve[30]).toBe(850);
    expect(curve[45]).toBe(700);
    expect(curve[60]).toBe(550);
  });

  it('sorts and ignores invalid points before interpolation', () => {
    const curve = interpolateMmpData([
      { duration: 60, power: 300 },
      { duration: 0, power: 999 },
      { duration: 30, power: 600 },
    ]);

    expect(curve[30]).toBe(600);
    expect(curve[60]).toBe(300);
  });
});
