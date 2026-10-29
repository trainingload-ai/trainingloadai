import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const PUBLIC_WORKOUT_SPORTS = [
  'running',
  'cycling',
  'swimming',
  'generic',
  'strength',
] as const;

export class EncodeWorkoutDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  text!: string;

  @IsOptional()
  @IsString()
  @IsIn(PUBLIC_WORKOUT_SPORTS)
  sport?: (typeof PUBLIC_WORKOUT_SPORTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  subSport?: string;
}
