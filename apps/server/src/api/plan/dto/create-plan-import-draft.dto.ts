import { IsObject } from 'class-validator';

export class CreatePlanImportDraftDto {
  @IsObject()
  draft!: Record<string, unknown>;
}
