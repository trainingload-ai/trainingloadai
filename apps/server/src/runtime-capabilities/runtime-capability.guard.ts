import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RuntimeCapabilityService } from './runtime-capability.service';
import { RUNTIME_CAPABILITY_METADATA } from './requires-runtime-capability.decorator';
import type { RuntimeCapabilityName } from './runtime-capability.types';

@Injectable()
export class RuntimeCapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly capabilities: RuntimeCapabilityService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<RuntimeCapabilityName>(
      RUNTIME_CAPABILITY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!capability) return true;
    this.capabilities.require(capability);
    return true;
  }
}
