import { describe, expect, it } from '@jest/globals';
import {
  isPersonalActivitySerialHeld,
  personalSyncCounts,
  personalSyncJobResult,
} from '../personal-sync-summary';

describe('personalSyncCounts serial holds', () => {
  it('counts held siblings as discovered/pending but not downloading', () => {
    const counts = personalSyncCounts([
      {
        kind: 'ACTIVITY',
        status: 'WAITING',
        result: { serialHeld: true },
      },
      {
        kind: 'ACTIVITY',
        status: 'WAITING',
        result: { serialHeld: true },
      },
      {
        kind: 'ACTIVITY',
        status: 'QUEUED',
        result: { serialHeld: false },
      },
    ]);
    expect(isPersonalActivitySerialHeld({ serialHeld: true })).toBe(true);
    expect(counts).toMatchObject({
      discovered: 3,
      downloading: 1,
      importing: 0,
      pending: 3,
      failed: 0,
    });
  });
});

describe('personalSyncJobResult', () => {
  const liveChildren = [
    {
      kind: 'ACTIVITY',
      status: 'SUCCEEDED',
      result: { imported: 1 },
    },
    {
      kind: 'ACTIVITY',
      status: 'WAITING',
      result: { serialHeld: false },
    },
  ];

  it('keeps frozen counts on FAILED/SUCCEEDED parents', () => {
    expect(
      personalSyncJobResult(
        {
          status: 'FAILED',
          result: {
            childIds: ['a', 'b'],
            discovered: 49,
            downloading: 0,
            importing: 0,
            imported: 0,
            healthDays: 0,
            failed: 38,
            pending: 0,
          },
        },
        liveChildren,
      ),
    ).toMatchObject({
      discovered: 49,
      downloading: 0,
      imported: 0,
      failed: 38,
      pending: 0,
    });
  });

  it('recomputes live counts while the parent is still active', () => {
    expect(
      personalSyncJobResult(
        { status: 'WAITING', result: { childIds: ['a', 'b'] } },
        liveChildren,
      ),
    ).toMatchObject({
      discovered: 2,
      downloading: 1,
      imported: 1,
      pending: 1,
    });
  });
});
