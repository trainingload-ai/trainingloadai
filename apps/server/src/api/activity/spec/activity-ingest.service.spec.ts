import { describe, expect, it } from '@jest/globals';
import { ActivityIngestService } from '../activity-ingest.service';

describe('ActivityIngestService', () => {
  it('uses the transaction client when one is passed', () => {
    const tx = { activity: { id: 'tx-activity' }, activityLap: { id: 'tx-lap' } };
    const prisma = { activity: { id: 'prisma-activity' }, activityLap: { id: 'prisma-lap' } };
    const ingest = new ActivityIngestService(prisma as never);
    expect(ingest.activity(tx as never)).toEqual({ id: 'tx-activity' });
    expect(ingest.activityLap(tx as never)).toEqual({ id: 'tx-lap' });
    expect(ingest.activity()).toEqual({ id: 'prisma-activity' });
  });
});
