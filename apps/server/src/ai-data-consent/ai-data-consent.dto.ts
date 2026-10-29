import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const AI_DATA_CONSENT_SOURCES = [
  'ONBOARDING',
  'HOME_REMINDER',
  'COACH',
  'ACCOUNT_SETTINGS',
  'REVIEW_AUTOMATION',
] as const;

export type AiDataConsentSource = (typeof AI_DATA_CONSENT_SOURCES)[number];

export class UpdateAiDataConsentDto {
  @IsBoolean()
  granted: boolean;

  @IsIn(AI_DATA_CONSENT_SOURCES)
  source: AiDataConsentSource;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;
}
