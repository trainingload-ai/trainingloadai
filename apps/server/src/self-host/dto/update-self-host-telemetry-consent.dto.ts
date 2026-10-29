import { IsBoolean, IsIn, IsString } from 'class-validator';
import {
  SELF_HOST_TELEMETRY_CONSENT_SOURCES,
  type SelfHostTelemetryConsentSource,
} from '../self-host-telemetry-consent.types';

export class UpdateSelfHostTelemetryConsentDto {
  @IsBoolean()
  granted!: boolean;

  @IsString()
  @IsIn(SELF_HOST_TELEMETRY_CONSENT_SOURCES)
  source!: SelfHostTelemetryConsentSource;
}
