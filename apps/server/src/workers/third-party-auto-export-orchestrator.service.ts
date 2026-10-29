import { Inject, Injectable, Optional } from '@nestjs/common';

export type ThirdPartyAutoExportProvider = string;

export type ThirdPartyAutoExportRun = {
  results: Partial<Record<ThirdPartyAutoExportProvider, unknown>>;
  providerLabels: Record<ThirdPartyAutoExportProvider, string>;
  failures: Array<{
    provider: ThirdPartyAutoExportProvider;
    displayName: string;
    error: string;
  }>;
};

export type ThirdPartyAutoExportAdapter = {
  provider: ThirdPartyAutoExportProvider;
  displayName: string;
  export(args: { userId: string; activityIds: number[] }): Promise<unknown>;
};

export const THIRD_PARTY_AUTO_EXPORT_ADAPTERS = Symbol(
  'THIRD_PARTY_AUTO_EXPORT_ADAPTERS',
);

/**
 * Core 只认识适配器协议；不同部署入口负责注入各自允许的 Provider。
 */
@Injectable()
export class ThirdPartyAutoExportOrchestratorService {
  private readonly adapters = new Map<
    ThirdPartyAutoExportProvider,
    ThirdPartyAutoExportAdapter
  >();

  constructor(
    @Optional()
    @Inject(THIRD_PARTY_AUTO_EXPORT_ADAPTERS)
    adapters: readonly ThirdPartyAutoExportAdapter[] = [],
  ) {
    for (const adapter of adapters) this.registerAdapter(adapter);
  }

  registerAdapter(adapter: ThirdPartyAutoExportAdapter): () => void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(
        `Third-party auto-export adapter already registered: ${adapter.provider}`,
      );
    }
    this.adapters.set(adapter.provider, adapter);
    return () => {
      if (this.adapters.get(adapter.provider) === adapter) {
        this.adapters.delete(adapter.provider);
      }
    };
  }

  async run(args: {
    userId: string;
    activityIds: number[];
  }): Promise<ThirdPartyAutoExportRun> {
    const results: ThirdPartyAutoExportRun['results'] = {};
    const providerLabels: ThirdPartyAutoExportRun['providerLabels'] = {};
    const failures: ThirdPartyAutoExportRun['failures'] = [];
    const outcomes = await Promise.all(
      [...this.adapters.values()].map(async (adapter) => {
        providerLabels[adapter.provider] = adapter.displayName;
        try {
          return {
            provider: adapter.provider,
            displayName: adapter.displayName,
            result: await adapter.export(args),
          } as const;
        } catch (error) {
          return {
            provider: adapter.provider,
            displayName: adapter.displayName,
            error,
          } as const;
        }
      }),
    );
    for (const outcome of outcomes) {
      if ('result' in outcome) {
        results[outcome.provider] = outcome.result;
      } else {
        failures.push({
          provider: outcome.provider,
          displayName: outcome.displayName,
          error:
            outcome.error instanceof Error
              ? outcome.error.message
              : String(outcome.error),
        });
      }
    }
    return { results, providerLabels, failures };
  }
}
