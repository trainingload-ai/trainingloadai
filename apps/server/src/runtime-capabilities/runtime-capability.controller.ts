import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { RuntimeCapabilityService } from './runtime-capability.service';
import { RawResponse } from '@/response-envelope';

@RawResponse()
@Controller('/api/runtime')
export class RuntimeCapabilityController {
  constructor(private readonly capabilities: RuntimeCapabilityService) {}

  @Get('/capabilities')
  @AllowAnonymous()
  getCapabilities() {
    return this.capabilities.snapshot();
  }
}
