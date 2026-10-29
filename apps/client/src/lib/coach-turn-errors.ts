import {
  canUseCoachTurnServerMessage,
  coachTurnErrorReason,
  coachTurnErrorUserMessage,
  type CoachTurnErrorData,
  type CoachTurnErrorReason,
} from "@shared/coach-turn-error";

export function localizedCoachTurnError(
  error: CoachTurnErrorData,
  translate: (key: CoachTurnErrorReason) => string,
) {
  if (canUseCoachTurnServerMessage(error.code)) {
    const reviewedServerMessage = coachTurnErrorUserMessage(error);
    if (reviewedServerMessage) return reviewedServerMessage;
  }
  return translate(coachTurnErrorReason(error.code));
}
