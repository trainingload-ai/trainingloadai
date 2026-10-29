import { IsString } from 'class-validator';

export class ImportExternalWorkoutDto {
  @IsString()
  provider!: string;

  @IsString()
  sourceText!: string;
}
