import { IsNotEmpty, IsString } from 'class-validator';

export class ReplaceActivityPlanLinkDto {
  @IsString()
  @IsNotEmpty()
  workoutId!: string;
}
