import { describe, expect, it, jest } from '@jest/globals';

import { SourceAdapterRegistry } from '../source-adapters/source-adapter.registry';
import type {
  ImportSourceAdapter,
  SourceNormalizeInput,
} from '../source-adapters/source-adapter.interface';

describe('SourceAdapterRegistry', () => {
  function adapter(kind: string, sourceUid = `${kind.toLowerCase()}-uid`) {
    return {
      kind,
      normalize: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({
          sourceUid,
          sourceKind: kind,
          payloads: [],
          metadata: { kind },
        }),
    } as unknown as ImportSourceAdapter;
  }

  function createRegistry() {
    const file = adapter('FILE');
    const intervals = adapter('INTERVALS_ICU');

    return {
      adapters: { file, intervals },
      registry: new SourceAdapterRegistry([file, intervals]),
    };
  }

  it('lists the registered source kinds in constructor order', () => {
    const { registry } = createRegistry();

    expect(registry.listKinds()).toEqual(['FILE', 'INTERVALS_ICU']);
  });

  it('returns the adapter registered for a source kind', () => {
    const { adapters, registry } = createRegistry();

    expect(registry.get('FILE' as never)).toBe(adapters.file);
    expect(registry.get('INTERVALS_ICU' as never)).toBe(adapters.intervals);
  });

  it('delegates normalization to the matching adapter', async () => {
    const { adapters, registry } = createRegistry();
    const input = {
      kind: 'INTERVALS_ICU',
      sourceUid: 'activity-1',
      activity: { sport: 'running' },
    } as unknown as SourceNormalizeInput;

    await expect(registry.normalize(input)).resolves.toEqual({
      sourceUid: 'intervals_icu-uid',
      sourceKind: 'INTERVALS_ICU',
      payloads: [],
      metadata: { kind: 'INTERVALS_ICU' },
    });
    expect(adapters.intervals.normalize).toHaveBeenCalledWith(input);
    expect(adapters.file.normalize).not.toHaveBeenCalled();
  });

  it('throws for unregistered source kinds', () => {
    const { registry } = createRegistry();

    expect(() => registry.get('UNKNOWN' as never)).toThrow(
      'No source adapter registered for UNKNOWN',
    );
  });
});
