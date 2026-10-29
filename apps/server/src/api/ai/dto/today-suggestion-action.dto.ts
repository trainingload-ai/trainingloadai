import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import {
  TODAY_SUGGESTION_FEEDBACK_VALUES,
  TODAY_SUGGESTION_INTENT_TYPES,
  TODAY_SUGGESTION_INTERACTION_KINDS,
  type TodaySuggestionFeedback,
  type TodaySuggestionIntentType,
  type TodaySuggestionInteractionKind,
} from '@shared/ai-today-suggestion-contract';

export class TodaySuggestionInteractionDto {
  @IsIn(TODAY_SUGGESTION_INTERACTION_KINDS)
  kind!: TodaySuggestionInteractionKind;

  @IsOptional()
  @IsIn(TODAY_SUGGESTION_INTENT_TYPES)
  intentType?: TodaySuggestionIntentType;

  @IsOptional()
  @IsIn(TODAY_SUGGESTION_FEEDBACK_VALUES)
  feedback?: TodaySuggestionFeedback;
}

export class TodaySuggestionReminderDto {
  @IsString()
  @IsISO8601()
  remindAt!: string;
}
