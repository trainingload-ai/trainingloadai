import { describe, expect, it } from '@jest/globals';
import {
  mapIntervalsIcuWorkoutDocToPlanBlocks,
  parseIntervalsIcuCalendarEvent,
} from '../intervals-icu-workout-doc.mapper';
import {
  contentChecksum,
  syncChecksum,
} from '../intervals-icu-workout-checksum.util';

const VO2_FIXTURE = {
  steps: [
    {
      text: 'Warm up',
      power: { start: 50, end: 55, units: '%ftp' },
      duration: 300,
    },
    {
      reps: 6,
      text: '6x',
      steps: [
        {
          text: 'Hard',
          power: { value: 120, units: '%ftp' },
          duration: 120,
        },
        {
          text: 'Harder',
          power: { value: 130, units: '%ftp' },
          duration: 60,
        },
        {
          text: 'Easy',
          power: { value: 55, units: '%ftp' },
          duration: 180,
        },
      ],
    },
    {
      text: 'Cool Down',
      power: { units: '%ftp', value: 55 },
      duration: 300,
    },
  ],
  duration: 5400,
};

describe('intervals-icu-workout-doc.mapper', () => {
  it('maps warmup, repeat, and cooldown blocks', () => {
    const blocks = mapIntervalsIcuWorkoutDocToPlanBlocks(VO2_FIXTURE);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      type: 'work',
      steps: [
        expect.objectContaining({
          stepKind: 'WARMUP',
          duration: 300,
          primaryTargetMeta: expect.objectContaining({
            value: 50,
            valueHigh: 55,
            unit: '%',
          }),
        }),
      ],
    });
    expect(blocks[1]).toMatchObject({
      type: 'repeat',
      count: 6,
      children: expect.arrayContaining([
        expect.objectContaining({ type: 'work' }),
        expect.objectContaining({ type: 'rest' }),
      ]),
    });
    expect(blocks[2]).toMatchObject({
      type: 'work',
      steps: [
        expect.objectContaining({
          stepKind: 'COOLDOWN',
          duration: 300,
        }),
      ],
    });
  });

  it('parses calendar event metadata', () => {
    const parsed = parseIntervalsIcuCalendarEvent({
      id: 97443804,
      start_date_local: '2026-07-07T17:00:00',
      type: 'Ride',
      name: 'VO2 Session',
      description: 'Stay smooth',
      workout_doc: VO2_FIXTURE,
    } as never);

    expect(parsed).toMatchObject({
      scheduledDate: '2026-07-07',
      sportType: 'CYCLING',
      name: 'VO2 Session',
      notes: 'Stay smooth',
    });
    expect(parsed?.blocks.length).toBe(3);
  });

  it('keeps contentChecksum stable for the same blocks', () => {
    const blocks = mapIntervalsIcuWorkoutDocToPlanBlocks(VO2_FIXTURE);
    const first = contentChecksum({ sportType: 'CYCLING', blocks });
    const second = contentChecksum({ sportType: 'CYCLING', blocks });
    expect(first).toBe(second);
  });

  it('changes checksums when only the exact sport subtype changes', () => {
    const blocks = mapIntervalsIcuWorkoutDocToPlanBlocks(VO2_FIXTURE);
    expect(
      contentChecksum({
        sportType: 'CYCLING',
        subSportType: 'ROAD_CYCLING',
        blocks,
      }),
    ).not.toBe(
      contentChecksum({
        sportType: 'CYCLING',
        subSportType: 'MOUNTAIN_BIKING',
        blocks,
      }),
    );
  });

  it('changes syncChecksum when name changes but contentChecksum stays same', () => {
    const blocks = mapIntervalsIcuWorkoutDocToPlanBlocks(VO2_FIXTURE);
    const content = contentChecksum({ sportType: 'CYCLING', blocks });
    const syncA = syncChecksum({
      scheduledDate: '2026-07-07',
      sportType: 'CYCLING',
      name: 'A',
      notes: null,
      blocks,
    });
    const syncB = syncChecksum({
      scheduledDate: '2026-07-07',
      sportType: 'CYCLING',
      name: 'B',
      notes: null,
      blocks,
    });
    expect(content).toBe(contentChecksum({ sportType: 'CYCLING', blocks }));
    expect(syncA).not.toBe(syncB);
  });
});
