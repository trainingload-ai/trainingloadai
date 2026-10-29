import { Injectable, OnModuleInit } from '@nestjs/common';

import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { SelfHostAiConfigurationService } from './self-host-ai-configuration.service';

/**
 * Self-host 专属启动钩子。
 *
 * RuntimeCapabilityModule 属于 Core，不能反向依赖 SelfHostModule。实例配置的
 * 解密、注入和启动校验由 Self-host composition root 独占。
 */
@Injectable()
export class SelfHostRuntimeInitializer implements OnModuleInit {
  constructor(
    private readonly aiConfiguration: SelfHostAiConfigurationService,
    private readonly capabilities: RuntimeCapabilityService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.aiConfiguration.initializeRuntime();
    const snapshot = this.capabilities.snapshot();
    if (snapshot.ready) return;
    throw new Error(
      `SELF_HOST_CONFIG_INVALID: ${snapshot.startupErrors.join('; ')}`,
    );
  }
}
