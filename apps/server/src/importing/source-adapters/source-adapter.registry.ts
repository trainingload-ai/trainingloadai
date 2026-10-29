import { Injectable } from '@nestjs/common';
import type { ImportSourceKind } from '@prisma/client';
import type {
  ImportSourceAdapter,
  SourceNormalizeInput,
  SourceNormalizeResult,
} from './source-adapter.interface';

@Injectable()
export class SourceAdapterRegistry {
  private readonly adapters: Map<ImportSourceKind, ImportSourceAdapter>;

  constructor(adapters: readonly ImportSourceAdapter[]) {
    this.adapters = new Map<ImportSourceKind, ImportSourceAdapter>();
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.kind)) {
        throw new Error(
          `Duplicate source adapter registered for ${adapter.kind}`,
        );
      }
      this.adapters.set(adapter.kind, adapter);
    }
  }

  get(kind: ImportSourceKind) {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(`No source adapter registered for ${kind}`);
    }
    return adapter;
  }

  async normalize(input: SourceNormalizeInput): Promise<SourceNormalizeResult> {
    // 根据 sourceKind 走 adapter.normalize
    return this.get(input.kind).normalize(input);
  }

  listKinds() {
    return Array.from(this.adapters.keys());
  }
}
