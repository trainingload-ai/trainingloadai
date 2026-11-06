import { describe, expect, it } from '@jest/globals';
import {
  resolveUnknownActivitySport,
  type UnknownSportEvidence,
} from '../unknown-activity-sport-repair';

const sports = [
  { code: 'OTHER', family: 'UNKNOWN', active: true },
  { code: 'STRENGTH_TRAINING', family: 'UNKNOWN', active: true },
  { code: 'ROWING', family: 'UNKNOWN', active: true },
  { code: 'HIKING', family: 'RUN', active: true },
  { code: 'INDOOR_CYCLING', family: 'CYCLING', active: true },
  { code: 'STRETCHING', family: 'STRETCHING', active: true },
];
const mappings = [
  {
    provider: 'upload',
    externalCode: 'TRAINING',
    externalSubCode: 'STRENGTH_TRAINING',
    sportCode: 'STRENGTH_TRAINING',
  },
  {
    provider: 'upload',
    externalCode: 'FLEXIBILITY_TRAINING',
    externalSubCode: '',
    sportCode: 'STRETCHING',
  },
  {
    provider: 'strava',
    externalCode: 'VIRTUALRIDE',
    externalSubCode: '',
    sportCode: 'INDOOR_CYCLING',
  },
].map((m) => ({ ...m, priority: 10, active: true, direction: 'IMPORT' }));
const evidence = (
  overrides: Partial<UnknownSportEvidence> = {},
): UnknownSportEvidence => ({
  activityId: 1,
  sourceId: 'primary-1',
  canonicalSnapshotId: 'snapshot-1',
  current: { sportType: 'UNKNOWN', sportDefinitionCode: 'OTHER' },
  provider: 'upload',
  canonicalSport: 'UNKNOWN',
  metadata: {},
  rawPayload: {},
  ...overrides,
});
const resolve = (value: UnknownSportEvidence) =>
  resolveUnknownActivitySport(value, sports, mappings);

describe('evidence-based UNKNOWN sport repair', () => {
  it('retains conflicting source claims instead of choosing whichever resolves first', () => {
    const conflicting = [
      ...mappings,
      {
        provider: 'intervals_icu',
        externalCode: 'RUN',
        externalSubCode: '',
        sportCode: 'HIKING',
        priority: 10,
        active: true,
        direction: 'IMPORT',
      },
    ];
    expect(
      resolveUnknownActivitySport(
        evidence({
          provider: 'intervals_icu',
          metadata: {
            type: 'Run',
            trackswapSport: 'training',
            trackswapSubSport: 'flexibilityTraining',
          },
        }),
        sports,
        conflicting,
      ),
    ).toMatchObject({
      status: 'UNRESOLVED',
      reason: 'SOURCE_SPORT_CONFLICT',
      after: null,
    });
  });
  it('repairs the family of an explicit selected hiking definition', () => {
    expect(
      resolve(
        evidence({
          current: { sportType: 'UNKNOWN', sportDefinitionCode: 'HIKING' },
        }),
      ),
    ).toMatchObject({
      status: 'REPAIR',
      after: { sportType: 'RUN', sportDefinitionCode: 'HIKING' },
    });
  });
  it('recovers old camelCase strength sub_sport without making it an endurance sport', () => {
    expect(
      resolve(
        evidence({
          metadata: {
            trackswapSport: 'training',
            trackswapSubSport: 'strengthTraining',
          },
        }),
      ),
    ).toMatchObject({
      status: 'REPAIR',
      after: { sportType: 'UNKNOWN', sportDefinitionCode: 'STRENGTH_TRAINING' },
    });
  });
  it('uses a precise flexibility subtype only inside a generic training container', () => {
    expect(
      resolve(
        evidence({
          metadata: {
            trackswapSport: 'fitnessEquipment',
            trackswapSubSport: 19,
          },
        }),
      ),
    ).toMatchObject({ after: { sportType: 'STRETCHING' } });
    expect(
      resolve(
        evidence({
          metadata: {
            trackswapSport: 'mixedMartialArts',
            trackswapSubSport: 19,
          },
        }),
      ),
    ).toMatchObject({ status: 'UNRESOLVED' });
  });
  it('recovers Strava virtual cycling from the original provider enum', () => {
    expect(
      resolve(
        evidence({
          provider: 'strava',
          rawPayload: { original: { sport_type: 'VirtualRide', type: 'Ride' } },
        }),
      ),
    ).toMatchObject({
      after: { sportType: 'CYCLING', sportDefinitionCode: 'INDOOR_CYCLING' },
    });
  });
  it('keeps valid other-sport definitions and pure generic events', () => {
    expect(
      resolve(
        evidence({
          current: { sportType: 'UNKNOWN', sportDefinitionCode: 'ROWING' },
        }),
      ),
    ).toMatchObject({
      status: 'PRESERVE',
      reason: 'KNOWN_SPORT_CLASSIFICATION',
    });
    expect(
      resolve(
        evidence({
          metadata: { trackswapSport: 'generic', trackswapSubSport: 'generic' },
        }),
      ),
    ).toMatchObject({
      status: 'UNRESOLVED',
      after: null,
      reason: 'SOURCE_ONLY_GENERIC_SPORT',
    });
  });
  it('preserves user classification edits and cannot infer sport from a title', () => {
    expect(resolve(evidence({ canonicalSport: 'RUN' }))).toMatchObject({
      status: 'PRESERVE',
      reason: 'USER_CLASSIFICATION_OVERRIDE',
    });
    expect(
      resolve(
        evidence({ rawPayload: { name: 'Morning Run', distance: 10000 } }),
      ),
    ).toMatchObject({ status: 'UNRESOLVED' });
  });
  it('records missing primary evidence and unsupported source types', () => {
    expect(resolve(evidence({ sourceId: null }))).toMatchObject({
      reason: 'PRIMARY_CANONICAL_MISSING',
    });
    expect(
      resolve(
        evidence({
          metadata: { trackswapSport: 'racket', trackswapSubSport: 'padel' },
        }),
      ),
    ).toMatchObject({ reason: 'SPORT_MAPPING_NOT_SUPPORTED' });
  });
  it('rejects equally ranked conflicting catalog mappings', () => {
    const duplicate = { ...mappings[0], sportCode: 'ROWING' };
    expect(
      resolveUnknownActivitySport(
        evidence({
          metadata: {
            trackswapSport: 'training',
            trackswapSubSport: 'strengthTraining',
          },
        }),
        sports,
        [...mappings, duplicate],
      ),
    ).toMatchObject({
      status: 'UNRESOLVED',
      reason: 'AMBIGUOUS_SPORT_MAPPING',
    });
  });
});
