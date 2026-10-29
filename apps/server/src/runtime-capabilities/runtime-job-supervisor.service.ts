import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { RuntimeCapabilityService } from './runtime-capability.service';

export type RuntimeJobDescriptor = {
  id: string;
  enabled(): boolean;
  start(): void;
  stop(): void;
};

/**
 * Owns the capability-driven lifecycle for optional background jobs.
 * A descriptor must keep start/stop idempotent; the supervisor guarantees that
 * only state transitions invoke them.
 */
@Injectable()
export class RuntimeJobSupervisor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuntimeJobSupervisor.name);
  private readonly jobs = new Map<
    string,
    { descriptor: RuntimeJobDescriptor; running: boolean }
  >();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly capabilities: RuntimeCapabilityService) {}

  onModuleInit(): void {
    this.unsubscribe = this.capabilities.onChange(() => this.reconcile());
    this.reconcile();
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const entry of this.jobs.values()) this.stop(entry);
    this.jobs.clear();
  }

  register(descriptor: RuntimeJobDescriptor): () => void {
    if (this.jobs.has(descriptor.id)) {
      throw new Error(`Runtime job already registered: ${descriptor.id}`);
    }
    const entry = { descriptor, running: false };
    this.jobs.set(descriptor.id, entry);
    this.reconcileEntry(entry);
    return () => {
      if (this.jobs.get(descriptor.id) !== entry) return;
      this.stop(entry);
      this.jobs.delete(descriptor.id);
    };
  }

  reconcile(): void {
    for (const entry of this.jobs.values()) this.reconcileEntry(entry);
  }

  private reconcileEntry(entry: {
    descriptor: RuntimeJobDescriptor;
    running: boolean;
  }): void {
    let enabled = false;
    try {
      enabled = entry.descriptor.enabled();
    } catch (error) {
      this.logger.error(
        `Failed to evaluate runtime job ${entry.descriptor.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (enabled && !entry.running) {
      entry.descriptor.start();
      entry.running = true;
    } else if (!enabled && entry.running) {
      this.stop(entry);
    }
  }

  private stop(entry: {
    descriptor: RuntimeJobDescriptor;
    running: boolean;
  }): void {
    if (!entry.running) return;
    entry.descriptor.stop();
    entry.running = false;
  }
}
