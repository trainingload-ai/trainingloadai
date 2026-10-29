import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SELF_HOST_AI_PROVIDERS } from '../self-host-ai-configuration.types';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateSelfHostAiConfigurationDto {
  @IsString()
  @IsIn(SELF_HOST_AI_PROVIDERS)
  @Transform(trimmed)
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  @Transform(trimmed)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(trimmed)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimmed)
  defaultModel?: string;

  @IsOptional()
  @IsInt()
  @Min(16_000)
  @Max(4_000_000)
  defaultModelContextTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimmed)
  reasoningModel?: string;

  @IsOptional()
  @IsInt()
  @Min(16_000)
  @Max(4_000_000)
  reasoningModelContextTokens?: number;

  @IsOptional()
  @IsBoolean()
  webSearchEnabled?: boolean;
}
