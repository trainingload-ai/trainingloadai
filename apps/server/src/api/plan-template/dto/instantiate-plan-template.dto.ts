import { IsString, Matches } from 'class-validator';

export class InstantiatePlanTemplateDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{40,100}$/)
  previewToken!: string;
}
