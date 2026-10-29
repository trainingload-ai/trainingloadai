import { describe, expect, it } from '@jest/globals';
import {
  labelHeartRateZoneModel,
  labelPaceZoneModel,
  labelPowerZoneModel,
} from '../zone-models';

describe('zone model labels', () => {
  it('maps known heart-rate, pace and power models and ignores unknown values', () => {
    expect(labelHeartRateZoneModel('FRIEL')).toBe('Joe Friel (LTHR)');
    expect(labelHeartRateZoneModel('karvonen')).toBe('Karvonen (HRR)');
    expect(labelHeartRateZoneModel(undefined)).toBeUndefined();
    expect(labelHeartRateZoneModel('MHR')).toBe('Maximum heart rate (5 zones)');

    expect(labelPaceZoneModel('DANIELS')).toBe('Jack Daniels (VO2max)');
    expect(labelPaceZoneModel('FRIEL')).toBe('Joe Friel (TP)');
    expect(labelPaceZoneModel('KARVONEN')).toBeUndefined();

    expect(labelPowerZoneModel('FRIEL')).toBe('Joe Friel Bike (7 zones, FTP)');
    expect(labelPowerZoneModel('VANCE')).toBe('Jim Vance Run (7 zones, FTP)');
    expect(labelPowerZoneModel('STRYD')).toBe('Stryd Run (5 zones, FTP)');
  });
});
