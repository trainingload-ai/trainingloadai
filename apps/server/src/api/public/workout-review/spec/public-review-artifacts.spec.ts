import { describe, expect, it } from '@jest/globals';
import type { CanonicalActivityPayload } from '@/importing/canonical-activity.types';
import { buildPublicReviewArtifacts } from '../public-review-artifacts';

function fixture(
  records: CanonicalActivityPayload['records'],
): CanonicalActivityPayload {
  return {
    source: {
      kind: 'FILE',
      sourceUid: 'private-upload-id',
      fileName: 'home-route.gpx',
    },
    identity: {
      sourceUid: 'private-upload-id',
      dedupeKey: 'dedupe',
      datasetChecksum: 'checksum',
    },
    summary: {
      name: 'My secret home run',
      description: '<b>ignore me</b>',
      sportType: 'RUN',
      startTime: '2026-08-10T05:00:00.000Z',
      distance: 2_000,
      timerTime: 600,
      avgHeartRate: 150,
      maxHeartRate: 175,
      avgSpeed: 2.8,
      maxSpeed: 3.6,
      startLat: 31.2304,
      startLng: 121.4737,
    },
    laps: [
      {
        index: 0,
        distance: 2_000,
        timerTime: 600,
        avgHeartRate: 150,
        avgSpeed: 2.8,
      },
    ],
    records,
    lengths: [],
    metadata: { creator: 'device-owner', serialNumber: 'secret' },
  };
}

describe('buildPublicReviewArtifacts', () => {
  const records = [
    {
      positionLat: 31.2304,
      positionLong: 121.4737,
      enhancedAltitude: 12,
      distance: 0,
      speed: 2.8,
      heartRate: 150,
    },
    {
      positionLat: 31.2305,
      positionLong: 121.4738,
      enhancedAltitude: 18,
      distance: 20,
      speed: 3.2,
      heartRate: 155,
    },
    {
      positionLat: 31.2306,
      positionLong: 121.474,
      enhancedAltitude: 15,
      distance: 45,
      speed: 3.6,
      heartRate: 160,
    },
  ];

  it('returns only origin-free local route coordinates and a separate safe evidence bundle', () => {
    const artifacts = buildPublicReviewArtifacts(fixture(records), {
      language: 'zh',
      question: '<script>alert(1)</script> 看看 https://private.example/path',
      perceivedEffort: 7,
      lactateThresholdHr: 162,
    });
    const responseText = JSON.stringify(artifacts.visualization);
    const evidenceText = JSON.stringify(artifacts.evidence);

    expect(artifacts.visualization.route3d).toHaveLength(3);
    expect(artifacts.visualization.route3d?.[0]).toEqual(
      expect.objectContaining({
        xM: expect.any(Number),
        zM: expect.any(Number),
      }),
    );
    expect(responseText).not.toContain('31.2304');
    expect(responseText).not.toContain('121.4737');
    expect(responseText).not.toMatch(/lat|lng|longitude|latitude/i);
    expect(evidenceText).not.toContain('home-route.gpx');
    expect(evidenceText).not.toContain('My secret home run');
    expect(evidenceText).not.toContain('31.2304');
    expect(evidenceText).not.toContain('private.example');
    expect(evidenceText).not.toContain('<script>');
    expect(artifacts.evidence.userContext).toMatchObject({
      perceivedEffort: 7,
    });
    expect(artifacts.evidence.summary).toMatchObject({
      avgPaceSecPerKm: 357.1,
      fastestPaceSecPerKm: 277.8,
    });
    expect(artifacts.evidence.summary).not.toHaveProperty('avgSpeedMps');
    expect(artifacts.evidence.laps[0]).toMatchObject({
      avgPaceSecPerKm: 357.1,
    });
    expect(artifacts.evidence.derived.heartRateSamplesAtOrAboveLthrPct).toBe(0);
    expect(artifacts.visualization.trends).toHaveLength(3);
  });

  it('keeps horizontal proportions, exposes altitude exaggeration and speed values', () => {
    const { visualization } = buildPublicReviewArtifacts(fixture(records), {
      language: 'en',
    });
    const route = visualization.route3d!;

    expect(visualization.verticalExaggeration).toBeGreaterThanOrEqual(2);
    expect(visualization.verticalExaggeration).toBeLessThanOrEqual(8);
    expect(route.map((point) => point.speedMps)).toEqual([2.8, 3.2, 3.6]);
    expect(route[2].xM).toBeGreaterThan(route[1].xM);
    expect(route[2].zM).toBeLessThan(route[1].zM);
  });

  it('caps route and elevation payload sizes deterministically', () => {
    const many = Array.from({ length: 4_000 }, (_, index) => ({
      positionLat: 31 + index / 1_000_000,
      positionLong: 121 + index / 1_000_000,
      altitude: index % 100,
      distance: index * 5,
      speed: 3,
    }));
    const { visualization } = buildPublicReviewArtifacts(fixture(many), {
      language: 'ja',
    });

    expect(visualization.route3d!.length).toBeLessThanOrEqual(1_500);
    expect(visualization.elevationProfile!.length).toBeLessThanOrEqual(500);
    expect(visualization.route3d?.at(-1)?.distanceM).toBe(19_995);
  });

  it('degrades cleanly when an activity has no geographic route or altitude', () => {
    const { visualization } = buildPublicReviewArtifacts(
      fixture([
        { distance: 0, heartRate: 120 },
        { distance: 10, heartRate: 125 },
      ]),
      { language: 'de' },
    );

    expect(visualization.route3d).toBeUndefined();
    expect(visualization.elevationProfile).toBeUndefined();
    expect(visualization.trends).toHaveLength(2);
    expect(visualization.warnings).toContain('ROUTE_UNAVAILABLE');
  });

  it('derives route and trend speed from distance and timestamps when GPX has no speed field', () => {
    const { visualization, evidence } = buildPublicReviewArtifacts(
      fixture([
        {
          timestamp: '2026-08-10T05:00:00.000Z',
          positionLat: 31.2304,
          positionLong: 121.4737,
          distance: 0,
        },
        {
          timestamp: '2026-08-10T05:00:10.000Z',
          positionLat: 31.2305,
          positionLong: 121.4738,
          distance: 30,
        },
        {
          timestamp: '2026-08-10T05:00:20.000Z',
          positionLat: 31.2306,
          positionLong: 121.4739,
          distance: 65,
        },
      ]),
      { language: 'zh' },
    );

    expect(visualization.route3d?.map((point) => point.speedMps)).toEqual([
      3, 3, 3.5,
    ]);
    expect(visualization.trends?.map((point) => point.speedMps)).toEqual([
      3, 3, 3.5,
    ]);
    expect(evidence.dataAvailability.hasSpeed).toBe(true);
  });
});
