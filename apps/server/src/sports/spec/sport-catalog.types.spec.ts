import { describe, expect, it } from '@jest/globals';
import {
  defaultSportDefinitionCode,
  normalizeSportDefinitionCode,
} from '../sport-catalog.types';

describe('sport catalog types', () => {
  it('uses the family default when the exact code is absent', () => {
    expect(defaultSportDefinitionCode('RUN')).toBe('ROAD_RUNNING');
    expect(normalizeSportDefinitionCode('RUN')).toBe('ROAD_RUNNING');
  });

  it('converts a family mistakenly supplied as an exact code', () => {
    expect(normalizeSportDefinitionCode('RUN', 'RUN')).toBe('ROAD_RUNNING');
    expect(normalizeSportDefinitionCode('CYCLING', ' cycling ')).toBe(
      'ROAD_CYCLING',
    );
  });

  it('normalizes and preserves a genuine exact code', () => {
    expect(normalizeSportDefinitionCode('RUN', 'trail-running')).toBe(
      'TRAIL_RUNNING',
    );
  });
});
