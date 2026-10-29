import type { EventEmitter2 } from '@nestjs/event-emitter';

export const AI_DATA_CONSENT_CHANGED_EVENT = 'ai.data-consent.changed.v1';

export type AiDataConsentChangedEvent = {
  userId: string;
  granted: boolean;
  decidedAt: string;
};

export async function emitAiDataConsentChanged(
  events: EventEmitter2 | undefined,
  event: AiDataConsentChangedEvent,
) {
  if (!events) return;
  await events.emitAsync(AI_DATA_CONSENT_CHANGED_EVENT, event);
}
