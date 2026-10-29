import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UpdateSelfHostAiConfigurationDto } from './dto/update-self-host-ai-configuration.dto';
import { SelfHostAiConfigurationService } from './self-host-ai-configuration.service';
import { SelfHostOwnerGuard } from './self-host-owner.guard';
import { SessionOnly } from '@/oauth/session-only.decorator';

@Controller('/api/self-host/settings/ai')
@SessionOnly()
@UseGuards(SelfHostOwnerGuard)
export class SelfHostAiConfigurationController {
  constructor(private readonly configuration: SelfHostAiConfigurationService) {}

  @Get()
  getConfiguration() {
    return this.configuration.getConfiguration();
  }

  @Put()
  updateConfiguration(@Body() body: UpdateSelfHostAiConfigurationDto) {
    return this.configuration.updateConfiguration(body);
  }
}
