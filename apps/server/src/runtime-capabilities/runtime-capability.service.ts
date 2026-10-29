import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { resolveRuntimeCapabilities } from './runtime-capability.resolver';
import type { RuntimeCapabilityName } from './runtime-capability.types';

@Injectable()
export class RuntimeCapabilityService {
  private readonly logger = new Logger(RuntimeCapabilityService.name);
  private readonly changeListeners = new Set<() => void>();

  snapshot() {
    const snapshot = resolveRuntimeCapabilities(process.env);
    return {
      ...snapshot,
      edition: snapshot.deployment === 'self-host' ? 'self-host' as const : 'cloud' as const,
      accountMode: snapshot.deployment === 'self-host' ? 'single-owner' as const : 'multi-user' as const,
      singleOwner: snapshot.deployment === 'self-host',
      apiVersion: 1 as const,
      version: process.env.APP_VERSION?.trim() || process.env.npm_package_version || 'development',
    };
  }

  isEnabled(name: RuntimeCapabilityName): boolean {
    return this.snapshot().capabilities[name].state === 'enabled';
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  notifyChanged(): void {
    for (const listener of this.changeListeners) listener();
  }

  /**
   * A self-host operator who supplies the AI provider also pays that provider
   * directly. When billing is disabled, keep the durable action/usage pipeline
   * but do not require or consume a hosted deployment entitlement.
   */
  isSelfHostOperatorFundedAi(): boolean {
    const snapshot = this.snapshot();
    return (
      snapshot.deployment === 'self-host' &&
      snapshot.capabilities.ai.state === 'enabled' &&
      snapshot.capabilities.billing.state !== 'enabled'
    );
  }

  require(name: RuntimeCapabilityName): void {
    const item = this.snapshot().capabilities[name];
    if (item.state === 'enabled') return;
    this.logger.warn(
      `Required capability unavailable name=${name} state=${item.state} code=${item.code}`,
    );
    throw new BusinessException({
      code:
        item.state === 'misconfigured'
          ? BUSINESS_ERROR_CODE.CAPABILITY_MISCONFIGURED
          : BUSINESS_ERROR_CODE.CAPABILITY_DISABLED,
      message: item.code,
    });
  }
}
