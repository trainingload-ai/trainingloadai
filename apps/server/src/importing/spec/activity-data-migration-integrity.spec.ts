import { ActivityDataMigrationService } from '../activity-data-migration.service';

function harness() {
  const row: any = {
    id: 'migration-1',
    userId: 'user-1',
    status: 'MIGRATING',
    phase: 'RAW_SCAN',
    rawCursor: 'previous-source',
    beforeManifest: { protectedHash: 'keep', rawFileIntegrityAudits: [] },
  };
  const audit = {
    sourceObjectId: 'source-1',
    basis: 'LEGACY_DISCOVERY_CHECKSUM' as const,
    registeredDiscoveryChecksum: '1'.repeat(40),
    observedFileSha256: 'a'.repeat(64),
    fileChecksumStatus: 'OBSERVED_LEGACY_FILE' as const,
  };
  const update = jest.fn(async ({ data }) => Object.assign(row, data));
  const tx = {
    $queryRaw: jest.fn(async () => []),
    activityDataMigration: { findUniqueOrThrow: async () => row, update },
  };
  const prisma = { ...tx, $transaction: async (fn: any) => fn(tx) };
  const repair = {
    scan: jest.fn(async () => ({
      integrityAudits: [audit],
      failures: [],
      candidates: [],
      lastScannedId: 'next-source',
      hasMore: true,
    })),
    enqueue: jest.fn(async () => undefined),
  };
  const service = new ActivityDataMigrationService(
    prisma as never,
    repair as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(service as any, 'start').mockResolvedValue(row);
  jest.spyOn(service, 'status').mockResolvedValue([]);
  return {
    row,
    audit,
    update,
    service,
    repair,
    record: (audits: any[]) =>
      (service as any).recordIntegrityAudits(row, audits),
  };
}

describe('migration discovery-integrity audit', () => {
  it('persists and deduplicates observed digests while preserving protection hashes', async () => {
    const h = harness();
    await h.record([h.audit]);
    await h.record([h.audit]);
    expect(h.row.beforeManifest).toEqual({
      protectedHash: 'keep',
      rawFileIntegrityAudits: [h.audit],
    });
  });
  it('rejects different bytes on retry before replacing the recorded digest', async () => {
    const h = harness();
    await h.record([h.audit]);
    h.update.mockClear();
    await expect(
      h.record([{ ...h.audit, observedFileSha256: 'b'.repeat(64) }]),
    ).rejects.toThrow('RAW_CHECKSUM_MISMATCH');
    expect(h.update).not.toHaveBeenCalled();
    expect(h.row.beforeManifest.rawFileIntegrityAudits).toEqual([h.audit]);
  });
  it('rejects changed discovery provenance on retry', async () => {
    const h = harness();
    await h.record([h.audit]);
    h.update.mockClear();
    await expect(
      h.record([{ ...h.audit, registeredDiscoveryChecksum: '2'.repeat(40) }]),
    ).rejects.toThrow('RAW_CHECKSUM_MISMATCH');
    expect(h.update).not.toHaveBeenCalled();
  });
  it('does not write after migration ownership/state changes', async () => {
    const h = harness();
    h.row.status = 'FAILED';
    await expect(h.record([h.audit])).rejects.toThrow(
      'ACTIVITY_MIGRATION_INTEGRITY_AUDIT_CONFLICT',
    );
    expect(h.update).not.toHaveBeenCalled();
  });
  it('records file identity before enqueueing replacements and advancing the cursor', async () => {
    const h = harness();
    h.repair.enqueue.mockImplementation(async () => {
      expect(h.row.beforeManifest.rawFileIntegrityAudits).toEqual([h.audit]);
      expect(h.row.rawCursor).toBe('previous-source');
    });
    await h.service.advance('run');
    expect(h.repair.enqueue).toHaveBeenCalledTimes(1);
    expect(h.row.rawCursor).toBe('next-source');
  });
  it('stops a changed-file retry without enqueueing or advancing its cursor', async () => {
    const h = harness();
    h.row.beforeManifest.rawFileIntegrityAudits = [
      { ...h.audit, observedFileSha256: 'b'.repeat(64) },
    ];
    await expect(h.service.advance('run')).rejects.toThrow(
      'RAW_CHECKSUM_MISMATCH',
    );
    expect(h.repair.enqueue).not.toHaveBeenCalled();
    expect(h.row.rawCursor).toBe('previous-source');
    expect(h.row.status).toBe('FAILED');
    expect(
      h.row.beforeManifest.rawFileIntegrityAudits[0].observedFileSha256,
    ).toBe('b'.repeat(64));
  });
});
