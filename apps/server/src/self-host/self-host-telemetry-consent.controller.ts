import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SessionOnly } from '@/oauth/session-only.decorator';
import { UpdateSelfHostTelemetryConsentDto } from './dto/update-self-host-telemetry-consent.dto';
import { SelfHostOwnerGuard } from './self-host-owner.guard';
import { SelfHostTelemetryConsentService } from './self-host-telemetry-consent.service';

@Controller('/api/self-host/settings/telemetry')
@SessionOnly()
@UseGuards(SelfHostOwnerGuard)
export class SelfHostTelemetryConsentController {
  constructor(private readonly consent: SelfHostTelemetryConsentService) {}

  @Get()
  getConsent() {
    return this.consent.getConsent();
  }

  @Put()
  updateConsent(@Body() body: UpdateSelfHostTelemetryConsentDto) {
    return this.consent.updateConsent(body);
  }
}
