import type { EventEmitter2 } from '@nestjs/event-emitter';

export const ATHLETE_STATE_REASSESS_REQUESTED_EVENT =
  'athlete-state.reassess-requested.v1';

export type AthleteStateReassessRequestedEvent = {
  userId: string;
  triggerType: string;
  triggerRef?: string;
  requestedAt: string;
};

export async function emitAthleteStateReassessRequested(
  events: EventEmitter2 | undefined,
  event: Omit<AthleteStateReassessRequestedEvent, 'requestedAt'>,
) {
  if (!events) return;
  await events.emitAsync(ATHLETE_STATE_REASSESS_REQUESTED_EVENT, {
    ...event,
    requestedAt: new Date().toISOString(),
  } satisfies AthleteStateReassessRequestedEvent);
}
