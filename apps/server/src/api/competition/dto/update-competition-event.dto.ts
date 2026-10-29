import { PartialType } from '@nestjs/mapped-types';
import { IsInt, Min } from 'class-validator';
import { CreateCompetitionEventDto } from './create-competition-event.dto';

export class UpdateCompetitionEventDto extends PartialType(
  CreateCompetitionEventDto,
) {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CompetitionEventVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
