import { IsString } from 'class-validator';

export class ParseTextDto {
  @IsString()
  text!: string;
}
