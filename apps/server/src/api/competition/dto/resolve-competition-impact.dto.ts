import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  SUPPORTED_APP_LOCALES,
  type SupportedAppLocale,
} from '@/utils/locale.util';

export const COMPETITION_ASSESSMENT_SCOPE_TYPES = [
  'PLAN_DRAFT',
  'PLAN_EXECUTION',
  'CALENDAR_RANGE',
  'DAY_DECISION',
  'WORKOUT_DECISION',
  'COACH_CONVERSATION',
] as const;

export type CompetitionAssessmentScopeType =
  (typeof COMPETITION_ASSESSMENT_SCOPE_TYPES)[number];

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ResolveCompetitionImpactDto {
  @IsIn(COMPETITION_ASSESSMENT_SCOPE_TYPES)
  scopeType!: CompetitionAssessmentScopeType;

  @IsString()
  @Matches(YMD_PATTERN)
  scopeStartDate!: string;

  @IsString()
  @Matches(YMD_PATTERN)
  scopeEndDate!: string;

  @IsString()
  @Matches(YMD_PATTERN)
  anchorDate!: string;

  @IsOptional()
  @IsIn(SUPPORTED_APP_LOCALES)
  locale?: SupportedAppLocale;

  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;
}
