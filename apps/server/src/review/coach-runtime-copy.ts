import { I18nService } from 'nestjs-i18n';

export type CoachRuntimeDecisionType =
  | 'PLAN_WORKOUT_POSTPONE'
  | 'PLAN_WORKOUT_RESCHEDULE'
  | 'PLAN_WORKOUT_ADD'
  | 'PLAN_WORKOUT_STATUS'
  | 'PLAN_WORKOUT_UPDATE';

export function coachRuntimeText(
  i18n: I18nService,
  lang: string,
  key: string,
  args?: Record<string, string | number>,
) {
  const value = i18n.t(`common.coachRuntime.${key}`, { lang, args });
  return typeof value === 'string' ? value : key;
}

export function coachRuntimeOptionTitle(
  i18n: I18nService,
  lang: string,
  decisionType: CoachRuntimeDecisionType,
  apply: boolean,
) {
  if (!apply) return coachRuntimeText(i18n, lang, 'optionKeepPlan');
  if (decisionType === 'PLAN_WORKOUT_STATUS') {
    return coachRuntimeText(i18n, lang, 'optionSkipSession');
  }
  if (decisionType === 'PLAN_WORKOUT_UPDATE') {
    return coachRuntimeText(i18n, lang, 'optionAdjustSession');
  }
  if (
    decisionType === 'PLAN_WORKOUT_ADD' ||
    decisionType === 'PLAN_WORKOUT_RESCHEDULE'
  ) {
    return coachRuntimeText(i18n, lang, 'optionAdjustSession');
  }
  return coachRuntimeText(i18n, lang, 'optionPostponeOneDay');
}
