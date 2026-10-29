import { describe, expect, it } from '@jest/globals';
import { normalizeZoneSettingRows } from '../zone-setting-order';

describe('normalizeZoneSettingRows', () => {
  it('rebuilds duplicate and sparse client orders from array position', () => {
    expect(
      normalizeZoneSettingRows([
        { order: 1, name: 'Z1', min: 0, max: 55 },
        { order: 4, name: 'Z4', min: 91, max: 105 },
        { order: 4, name: 'SS', min: 84, max: 97 },
        { order: 8, name: 'Z7', min: 151 },
      ]),
    ).toEqual([
      { order: 1, name: 'Z1', min: 0, max: 55, color: null },
      { order: 2, name: 'Z4', min: 91, max: 105, color: null },
      { order: 3, name: 'SS', min: 84, max: 97, color: null },
      { order: 4, name: 'Z7', min: 151, max: null, color: null },
    ]);
  });

  it('normalizes numeric fields while preserving optional text fields', () => {
    expect(
      normalizeZoneSettingRows([
        { name: 7, color: '#fff', min: '55.6', max: undefined },
      ]),
    ).toEqual([{ order: 1, name: '7', color: '#fff', min: 56, max: null }]);
  });
});
