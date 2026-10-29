import { Global, Module } from '@nestjs/common';
import { RuntimeCapabilityController } from './runtime-capability.controller';
import { RuntimeCapabilityService } from './runtime-capability.service';
import { RuntimeCapabilityGuard } from './runtime-capability.guard';
import { RuntimeJobSupervisor } from './runtime-job-supervisor.service';

@Global()
@Module({
  controllers: [RuntimeCapabilityController],
  providers: [
    RuntimeCapabilityService,
    RuntimeCapabilityGuard,
    RuntimeJobSupervisor,
  ],
  exports: [
    RuntimeCapabilityService,
    RuntimeCapabilityGuard,
    RuntimeJobSupervisor,
  ],
})
export class RuntimeCapabilityModule {}
